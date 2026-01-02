/**
 * Merged Stream - Combines multiple event sources into unified World Stream
 *
 * Extends the base World Stream to support pluggable event sources (SwarmDb, Git, etc.)
 * in addition to SSE. Uses Effect Stream.mergeAll to combine sources efficiently.
 *
 * Architecture:
 * - Checks source.available() before including in merge
 * - Filters out unavailable sources gracefully
 * - Uses Stream.mergeAll for concurrent event emission
 * - Maintains existing World Stream API (subscribe, getSnapshot, async iterator)
 *
 * Pattern from Hivemind (mem-dba88064f38c20fc):
 * - Stream.mergeAll for combining multiple streams
 * - Effect.all for parallel availability checks
 * - Graceful degradation when sources unavailable
 */

import { Effect, Stream, pipe, Scope, Exit } from "effect"
import type { EventSource, SourceEvent } from "./event-source.js"
import type { WorldStreamConfig, WorldStreamHandle, WorldState } from "./types.js"
import { WorldStore } from "./atoms.js"
import { WorldSSE } from "./sse.js"
import type { Message, Part, Session } from "../types/domain.js"
import type { SessionStatus } from "../types/events.js"

/**
 * Extended config for merged streams
 */
export interface MergedStreamConfig extends WorldStreamConfig {
	/**
	 * Additional event sources to merge with SSE
	 * Each source is checked for availability before inclusion
	 */
	sources?: EventSource[]
}

/**
 * Route a SourceEvent to appropriate WorldStore method
 *
 * Pattern: lightweight bridge between event stream and state mutations.
 * Stateless router - WorldStore handles deduplication via binary search.
 *
 * From Hivemind (mem-79f347f38521edd7): SSE-to-Store Bridge Pattern
 */
function routeEventToStore(event: SourceEvent, store: WorldStore): void {
	const { type, data } = event

	// Type guards prevent runtime errors from malformed events
	switch (type) {
		case "session.created":
		case "session.updated": {
			const session = data as Session
			if (session?.id) {
				store.upsertSession(session)
			}
			break
		}

		case "message.created":
		case "message.updated": {
			const message = data as Message
			if (message?.id) {
				store.upsertMessage(message)
				// Receiving message events = session is active
				// Mark as "running" since we're getting live data
				if (message.sessionID) {
					store.updateStatus(message.sessionID, "running")
				}
			}
			break
		}

		case "part.created":
		case "part.updated":
		case "message.part.updated": {
			// Handle both part.* and message.part.updated event types
			// message.part.updated wraps part data in a "part" property
			const partData =
				type === "message.part.updated" ? (data as { part?: Part }).part : (data as Part)

			if (partData?.id) {
				store.upsertPart(partData)
				// Receiving part events = session is active
				// Parts from SSE have sessionID directly
				const sessionId = (partData as Part & { sessionID?: string }).sessionID
				if (sessionId) {
					store.updateStatus(sessionId, "running")
				}
			}
			break
		}

		case "session.status": {
			const { sessionID, status } = data as {
				sessionID?: string
				status?: SessionStatus
			}
			if (sessionID && status) {
				store.updateStatus(sessionID, status)
			}
			break
		}

		// Unknown event types are ignored gracefully
		// Additional event types (memory_stored, bead_created from swarm-db) can be added here
		default:
			break
	}
}

/**
 * Extended handle with stream() method for testing
 * Not part of public WorldStreamHandle API
 */
export interface MergedStreamHandle extends WorldStreamHandle {
	/**
	 * Get merged event stream (for testing)
	 * Internal use only - not part of public API
	 */
	stream(): Stream.Stream<SourceEvent, Error>
}

/**
 * Create a merged world stream that combines SSE with additional event sources
 *
 * Checks each source's availability and merges all available streams using
 * Stream.mergeAll. Unavailable sources are filtered out gracefully.
 *
 * @param config - Configuration including optional additional sources
 *
 * @example
 * ```typescript
 * import { createMergedWorldStream, createSwarmDbSource } from "@opencode-vibe/core/world"
 *
 * const swarmDb = createSwarmDbSource("~/.config/swarm-tools/swarm.db")
 *
 * const stream = createMergedWorldStream({
 *   baseUrl: "http://localhost:1999",
 *   sources: [swarmDb]
 * })
 *
 * // All events (SSE + SwarmDb) flow through unified stream
 * for await (const world of stream) {
 *   console.log(world.sessions)
 * }
 * ```
 */
export function createMergedWorldStream(config: MergedStreamConfig = {}): MergedStreamHandle {
	const { baseUrl, autoReconnect = true, onEvent, sources = [] } = config

	const store = new WorldStore()

	// Create WorldSSE instance
	// If baseUrl provided, connect to that specific server
	// Otherwise, let WorldSSE use its built-in discovery loop to find and connect to ALL servers
	const sse = new WorldSSE(store, {
		serverUrl: baseUrl, // undefined = use discovery loop for all servers
		autoReconnect,
		onEvent,
	})
	sse.start()

	/**
	 * Create merged event stream from all available sources
	 *
	 * Checks availability and merges streams using Stream.mergeAll.
	 * Internal method for testing - not part of public WorldStreamHandle API.
	 */
	function stream(): Stream.Stream<SourceEvent, Error> {
		// Check availability for all sources in parallel
		// Catch both typed errors and defects (thrown exceptions)
		const availabilityChecks = sources.map((source) =>
			source.available().pipe(
				Effect.map((isAvailable) => ({ source, isAvailable })),
				// Catch defects first (thrown errors)
				Effect.catchAllDefect(() => Effect.succeed({ source, isAvailable: false })),
				// Then catch typed errors
				Effect.catchAll(() => Effect.succeed({ source, isAvailable: false })),
			),
		)

		return Stream.unwrap(
			Effect.gen(function* () {
				// Wait for all availability checks
				const results = yield* Effect.all(availabilityChecks, { concurrency: "unbounded" })

				// Filter to only available sources
				const availableSources = results.filter((r) => r.isAvailable).map((r) => r.source)

				// If no available sources, return empty stream
				if (availableSources.length === 0) {
					return Stream.empty
				}

				// Create streams from all available sources
				const streams = availableSources.map((source) => source.stream())

				// Merge all streams
				return Stream.mergeAll(streams, { concurrency: "unbounded" })
			}),
		)
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
	 *
	 * Uses Effect acquireRelease for guaranteed cleanup.
	 * Pattern from Hivemind (mem-fa2e52bd6e3f080b): acquireRelease ensures
	 * cleanup (unsubscribe) is called even on interruption/scope close.
	 */
	async function* asyncIterator(): AsyncIterableIterator<WorldState> {
		// Yield current state immediately
		yield store.getState()

		// Use Effect Scope + acquireRelease for subscription lifecycle
		// This guarantees unsubscribe is called even if iterator is abandoned mid-stream
		const scope = await Effect.runPromise(Scope.make())

		try {
			// Acquire subscription with guaranteed cleanup via acquireRelease
			const subscription = await Effect.runPromise(
				pipe(
					Effect.acquireRelease(
						// Acquire: subscribe to store and set up queue
						Effect.sync(() => {
							const queue: WorldState[] = []
							let resolveNext: ((state: WorldState) => void) | null = null

							const unsubscribe = store.subscribe((state) => {
								if (resolveNext) {
									// If iterator is waiting, resolve immediately
									resolveNext(state)
									resolveNext = null
								} else {
									// Otherwise, queue for later consumption
									queue.push(state)
								}
							})

							// Return subscription handle with queue access
							return {
								unsubscribe,
								queue,
								setResolveNext: (fn: typeof resolveNext) => {
									resolveNext = fn
								},
							}
						}),
						// Release: guaranteed cleanup (called when scope closes)
						({ unsubscribe }) => Effect.sync(unsubscribe),
					),
					Scope.extend(scope),
				),
			)

			// Yield states as they arrive using queue pattern
			try {
				while (true) {
					if (subscription.queue.length > 0) {
						// Drain queue first
						yield subscription.queue.shift()!
					} else {
						// Wait for next state via Promise
						const state = await new Promise<WorldState>((resolve) => {
							subscription.setResolveNext(resolve)
						})
						yield state
					}
				}
			} finally {
				// Close scope to trigger cleanup (acquireRelease calls unsubscribe)
				await Effect.runPromise(Scope.close(scope, Exit.succeed(undefined as void)))
			}
		} catch (error) {
			// Ensure scope is closed on error path too
			await Effect.runPromise(Scope.close(scope, Exit.succeed(undefined as void)))
			throw error
		}
	}

	/**
	 * Clean up resources
	 */
	async function dispose(): Promise<void> {
		sse?.stop()
	}

	// Start event consumer for additional sources (swarm-db, etc.)
	// SSE is handled separately by WorldSSE for backward compatibility
	// Consumer runs in background and routes events to WorldStore
	if (sources.length > 0) {
		const consumerEffect = pipe(
			stream(),
			Stream.runForEach((event) =>
				Effect.sync(() => {
					routeEventToStore(event, store)

					// Call onEvent callback for all source events (not just SSE)
					if (onEvent) {
						// Convert SourceEvent to SSEEventInfo format
						// Extract properties from data (assuming data is an object)
						const properties =
							typeof event.data === "object" && event.data !== null
								? (event.data as Record<string, unknown>)
								: { raw: event.data }

						onEvent({
							source: event.source, // Top-level source for formatSSEEvent
							type: event.type,
							properties,
						})
					}
				}),
			),
			// Catch all errors to prevent consumer from crashing
			Effect.catchAll(() => Effect.void),
		)

		// Run consumer in background (fire and forget)
		Effect.runPromise(consumerEffect).catch(() => {
			// Consumer errors are logged but don't crash the stream
			// This allows graceful degradation if sources fail
		})
	}

	return {
		subscribe,
		getSnapshot,
		stream,
		[Symbol.asyncIterator]: asyncIterator,
		dispose,
	}
}
