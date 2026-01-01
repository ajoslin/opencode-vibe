/**
 * World Stream - Reactive SSE consumer with async iterator
 *
 * Creates a handle for subscribing to world state changes via SSE.
 * Provides sync subscription API and async iterator for streaming.
 */

import { Effect, Stream, Schedule } from "effect"
import { MultiServerSSE } from "../sse/multi-server-sse.js"
import type { Message, Part, Session } from "../types/domain.js"
import type { GlobalEvent, SessionStatus } from "../types/events.js"
import { WorldStore } from "./atoms.js"
import type { WorldState, WorldStreamConfig, WorldStreamHandle } from "./types.js"
import { createClient } from "../client/index.js"
import { normalizeBackendStatus, type BackendSessionStatus } from "../types/sessions.js"
import type { EventOffset } from "./cursor.js"
import type { WorldEvent } from "./events.js"

/**
 * CatchUpResponse: bounded history query result
 *
 * Used by catchUpEvents to return a bounded set of historical events
 * with a cursor for resuming the stream.
 */
export interface CatchUpResponse {
	events: WorldEvent[]
	nextOffset: EventOffset | null
	upToDate: boolean
}

/**
 * Create a world stream from SSE events
 *
 * @example
 * ```typescript
 * const stream = createWorldStream({ baseUrl: "http://localhost:1999" })
 *
 * // Subscribe API
 * const unsub = stream.subscribe((world) => console.log(world))
 *
 * // Async iterator API
 * for await (const world of stream) {
 *   console.log(world.sessions.length)
 * }
 *
 * await stream.dispose()
 * ```
 */
export function createWorldStream(config: WorldStreamConfig = {}): WorldStreamHandle {
	const { baseUrl = "http://localhost:1999", autoReconnect = true } = config

	const store = new WorldStore()
	const sse = new MultiServerSSE()
	const asyncIteratorSubscribers = new Set<(state: WorldState) => void>()

	// Wire SSE events to store updates
	sse.onEvent((event: GlobalEvent) => {
		handleSSEEvent(event)
	})

	/**
	 * Bootstrap: Fetch initial data then start SSE connection
	 */
	async function bootstrap(): Promise<void> {
		try {
			store.setConnectionStatus("connecting")

			// Create client with explicit baseUrl for CLI usage
			const { createOpencodeClient } = await import("@opencode-ai/sdk/client")
			const client = createOpencodeClient({ baseUrl })

			// Fetch /session/list and /session/status in parallel
			const [sessionsResponse, statusResponse] = await Promise.all([
				client.session.list(),
				client.session.status(),
			])

			const sessions = sessionsResponse.data || []
			const backendStatusMap =
				(statusResponse.data as Record<string, BackendSessionStatus> | null) || {}

			// Normalize backend status format to SessionStatus
			const statusMap: Record<string, SessionStatus> = {}
			for (const [sessionId, backendStatus] of Object.entries(backendStatusMap)) {
				statusMap[sessionId] = normalizeBackendStatus(backendStatus)
			}

			// Populate store
			store.setSessions(sessions)
			store.setStatus(statusMap)

			// Mark as connected
			store.setConnectionStatus("connected")

			// Start SSE connection
			sse.start()
		} catch (error) {
			console.error("[WorldStream] Bootstrap failed:", error)
			store.setConnectionStatus("error")
		}
	}

	// Kick off bootstrap
	bootstrap()

	/**
	 * Handle incoming SSE events
	 */
	function handleSSEEvent(event: GlobalEvent): void {
		const { type, properties } = event.payload

		switch (type) {
			case "session.created":
			case "session.updated": {
				const session = properties as unknown as Session
				store.upsertSession(session)
				break
			}

			case "message.created":
			case "message.updated": {
				const message = properties as unknown as Message
				store.upsertMessage(message)
				break
			}

			case "part.created":
			case "part.updated": {
				const part = properties as unknown as Part
				store.upsertPart(part)
				break
			}

			case "session.status": {
				const { sessionID, status } = properties as {
					sessionID: string
					status: SessionStatus
				}
				store.updateStatus(sessionID, status)
				break
			}
		}
	}

	/**
	 * Subscribe to world state changes
	 */
	function subscribe(callback: (state: WorldState) => void): () => void {
		return store.subscribe(callback)
	}

	/**
	 * Get current world state snapshot
	 */
	async function getSnapshot(): Promise<WorldState> {
		return store.getState()
	}

	/**
	 * Async iterator for world state changes
	 */
	async function* asyncIterator(): AsyncIterableIterator<WorldState> {
		// Yield current state immediately
		yield store.getState()

		// Then yield on every change
		const queue: WorldState[] = []
		let resolveNext: ((state: WorldState) => void) | null = null

		const unsubscribe = store.subscribe((state) => {
			if (resolveNext) {
				resolveNext(state)
				resolveNext = null
			} else {
				queue.push(state)
			}
		})

		try {
			while (true) {
				if (queue.length > 0) {
					yield queue.shift()!
				} else {
					// Wait for next state
					const state = await new Promise<WorldState>((resolve) => {
						resolveNext = resolve
					})
					yield state
				}
			}
		} finally {
			unsubscribe()
		}
	}

	/**
	 * Clean up resources
	 */
	async function dispose(): Promise<void> {
		sse.stop()
		store.setConnectionStatus("disconnected")
		asyncIteratorSubscribers.clear()
	}

	return {
		subscribe,
		getSnapshot,
		[Symbol.asyncIterator]: asyncIterator,
		dispose,
	}
}

/**
 * catchUpEvents: Fetch bounded history of events
 *
 * Returns historical events from the given offset (or beginning if none).
 * The last event in the response includes upToDate: true.
 *
 * Pattern: Durable Streams catch-up phase
 *
 * @param offset - Optional offset to resume from
 * @returns Effect yielding CatchUpResponse
 *
 * @example
 * ```typescript
 * const response = await Effect.runPromise(catchUpEvents())
 * console.log(response.events.length) // Historical events
 * console.log(response.upToDate) // true when caught up
 * ```
 */
export function catchUpEvents(offset?: EventOffset): Effect.Effect<CatchUpResponse> {
	return Effect.gen(function* (_) {
		// Fetch initial state from all discovered servers
		const sse = new MultiServerSSE()
		const servers = sse.getDiscoveredServers()

		if (servers.length === 0) {
			// No servers discovered yet - return empty catch-up
			return {
				events: [],
				nextOffset: null,
				upToDate: true,
			}
		}

		// Create client and fetch session data from all servers in parallel
		const { createOpencodeClient } = yield* _(
			Effect.promise(() => import("@opencode-ai/sdk/client")),
		)

		const events: WorldEvent[] = []
		let offsetCounter = offset ? Number.parseInt(offset as string, 10) : 0

		// Fetch from each server
		for (const server of servers) {
			const client = createOpencodeClient({ baseUrl: `/api/opencode/${server.port}` })

			const [sessionsResponse, statusResponse] = yield* _(
				Effect.promise(() => Promise.all([client.session.list(), client.session.status()])),
			)

			const sessions = sessionsResponse.data || []
			const backendStatusMap =
				(statusResponse.data as Record<string, BackendSessionStatus> | null) || {}

			// Convert sessions to synthetic WorldEvent[]
			for (const session of sessions) {
				offsetCounter++
				const isLast = false // We'll reconstruct the last one separately
				events.push({
					type: "session.created",
					offset: String(offsetCounter).padStart(10, "0") as EventOffset,
					timestamp: Date.now(),
					upToDate: isLast,
					payload: {
						id: session.id,
						projectKey: server.directory,
					},
				})
			}

			// Convert status data to synthetic events
			for (const [sessionId, backendStatus] of Object.entries(backendStatusMap)) {
				const status = normalizeBackendStatus(backendStatus)
				offsetCounter++
				events.push({
					type: "session.updated",
					offset: String(offsetCounter).padStart(10, "0") as EventOffset,
					timestamp: Date.now(),
					upToDate: false,
					payload: {
						id: sessionId,
						status: status,
					},
				})
			}
		}

		// Reconstruct last event with upToDate: true
		if (events.length > 0) {
			const lastEvent = events[events.length - 1]
			events[events.length - 1] = {
				...lastEvent,
				upToDate: true,
			}
		}

		return {
			events,
			nextOffset: events.length > 0 ? events[events.length - 1].offset : null,
			upToDate: true,
		}
	})
}

/**
 * tailEvents: Unbounded live polling stream
 *
 * Subscribes to MultiServerSSE for real-time events.
 * Converts GlobalEvent → WorldEvent with monotonic offsets.
 *
 * Pattern: Durable Streams live/tail phase
 *
 * @param offset - Optional offset to start from (used for monotonic offset generation)
 * @returns Stream of WorldEvents
 *
 * @example
 * ```typescript
 * const stream = tailEvents()
 * for await (const event of stream) {
 *   console.log(event.type, event.offset)
 * }
 * ```
 */
export function tailEvents(offset?: EventOffset): Stream.Stream<WorldEvent> {
	return Stream.async<WorldEvent>((emit) => {
		const sse = new MultiServerSSE()
		let offsetCounter = offset ? Number.parseInt(offset as string, 10) : 0

		// Start SSE discovery and connections
		sse.start()

		// Subscribe to all SSE events
		const unsubscribe = sse.onEvent((event: GlobalEvent) => {
			// Convert GlobalEvent → WorldEvent
			const { type, properties } = event.payload

			// Filter for recognized event types
			if (
				!type.startsWith("session.") &&
				!type.startsWith("message.") &&
				!type.startsWith("part.")
			) {
				return
			}

			offsetCounter++
			const worldEvent: WorldEvent = {
				type: type as WorldEvent["type"],
				offset: String(offsetCounter).padStart(10, "0") as EventOffset,
				timestamp: Date.now(),
				upToDate: false,
				payload: properties as any, // Type is validated by event type discriminator
			}

			emit.single(worldEvent)
		})

		// Cleanup
		return Effect.sync(() => {
			unsubscribe()
			sse.stop()
		})
	})
}

/**
 * resumeEvents: Combined catch-up + live stream
 *
 * Implements the Durable Streams resume pattern:
 * 1. Catch-up: Fetch bounded history from savedOffset
 * 2. Live: Continuously poll for new events after catch-up
 *
 * Uses Stream.scan for offset tracking across both phases.
 * Uses Stream.concat to join catch-up history with live tail.
 *
 * @param savedOffset - Optional offset to resume from
 * @returns Stream of WorldEvents
 *
 * @example
 * ```typescript
 * const stream = resumeEvents("12345" as EventOffset)
 * for await (const event of stream) {
 *   if (event.upToDate) {
 *     console.log("Caught up! Now live...")
 *   }
 * }
 * ```
 */
export function resumeEvents(savedOffset?: EventOffset): Stream.Stream<WorldEvent> {
	// Phase 1: Catch-up (bounded history)
	const catchUpStream = Stream.fromEffect(catchUpEvents(savedOffset)).pipe(
		Stream.flatMap((response) => Stream.fromIterable(response.events)),
	)

	// Phase 2: Live tail (unbounded polling)
	// Extract nextOffset from catch-up response to start tail
	const liveStream = Stream.fromEffect(catchUpEvents(savedOffset)).pipe(
		Stream.flatMap((response) => tailEvents(response.nextOffset || savedOffset)),
	)

	// Concatenate: catch-up first, then live
	return Stream.concat(catchUpStream, liveStream).pipe(
		// Track offsets using scan
		Stream.scan(
			{ lastOffset: savedOffset, event: null as WorldEvent | null } as {
				lastOffset: EventOffset | undefined
				event: WorldEvent | null
			},
			(state, event) => ({
				lastOffset: event.offset,
				event: event,
			}),
		),
		// Map back to just events (scan adds tracking state)
		Stream.map(({ event }) => event!),
		// Filter out null events from initial scan state
		Stream.filter((event): event is WorldEvent => event !== null),
	)
}
