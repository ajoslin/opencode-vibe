/**
 * World SSE - Self-contained SSE connection management
 *
 * Effect-forward implementation that:
 * 1. Discovers servers via lsof (no proxy routes)
 * 2. Connects directly to server SSE endpoints
 * 3. Feeds events to WorldStore atoms
 *
 * This replaces MultiServerSSE with a clean, self-contained implementation.
 */

import {
	Effect,
	Stream,
	Schedule,
	Fiber,
	Ref,
	Queue,
	Scope,
	Metric,
	Duration,
	Context,
	Layer,
	Exit,
} from "effect"
import { createParser, type EventSourceParser } from "eventsource-parser"
import type { Message, Part, Session } from "../types/domain.js"
import type { SessionStatus } from "../types/events.js"
import { normalizeBackendStatus, type BackendSessionStatus } from "../types/sessions.js"
import { WorldStore } from "./atoms.js"
import type { SSEEventInfo } from "./types.js"
import { WorldMetrics } from "./metrics.js"

// ============================================================================
// Types
// ============================================================================

export interface DiscoveredServer {
	port: number
	pid: number
	directory: string
}

export interface SSEEvent {
	type: string
	properties: Record<string, unknown>
}

export interface WorldSSEConfig {
	/** Specific server URL to connect to (skips discovery) */
	serverUrl?: string
	/** Discovery interval in ms (default: 5000) */
	discoveryIntervalMs?: number
	/** Reconnect on disconnect (default: true) */
	autoReconnect?: boolean
	/** Max reconnect attempts (default: 10) */
	maxReconnectAttempts?: number
	/** Callback for raw SSE events (for logging/debugging) */
	onEvent?: (event: SSEEventInfo) => void
}

// ============================================================================
// Discovery - lsof based, works in CLI and server contexts
// ============================================================================

/**
 * Discover running OpenCode servers via lsof
 *
 * Scans for bun/opencode processes listening on TCP ports,
 * then verifies each is an OpenCode server via /project/current
 */
export function discoverServers(): Effect.Effect<DiscoveredServer[], Error> {
	return Effect.gen(function* () {
		// Check if we're in a browser (no lsof available)
		if (typeof window !== "undefined") {
			return []
		}

		// Dynamic import for Node.js child_process
		const { exec } = yield* Effect.promise(() => import("child_process"))
		const { promisify } = yield* Effect.promise(() => import("util"))
		const execAsync = promisify(exec)

		// Find listening TCP ports for bun/opencode processes
		const result = yield* Effect.tryPromise({
			try: async () => {
				try {
					const { stdout } = await execAsync(
						`lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | grep -E 'bun|opencode' | awk '{print $2, $9}'`,
						{ timeout: 2000 },
					)
					return stdout
				} catch (error: any) {
					// lsof returns exit code 1 when grep finds no matches - that's OK
					if (error.stdout !== undefined) {
						return error.stdout || ""
					}
					throw error
				}
			},
			catch: (error) => new Error(`Discovery failed: ${error}`),
		})

		// Parse candidates
		const candidates: Array<{ port: number; pid: number }> = []
		const seen = new Set<number>()

		for (const line of result.trim().split("\n")) {
			if (!line) continue
			const [pid, address] = line.split(" ")
			const portMatch = address?.match(/:(\d+)$/)
			if (!portMatch) continue

			const port = parseInt(portMatch[1]!, 10)
			if (seen.has(port)) continue
			seen.add(port)

			candidates.push({ port, pid: parseInt(pid!, 10) })
		}

		// Verify each candidate is an OpenCode server
		const servers: DiscoveredServer[] = []

		for (const candidate of candidates) {
			const server = yield* verifyServer(candidate.port, candidate.pid)
			if (server) {
				servers.push(server)
			}
		}

		return servers
	})
}

/**
 * Verify a port is an OpenCode server by checking /project/current
 */
function verifyServer(port: number, pid: number): Effect.Effect<DiscoveredServer | null, never> {
	return Effect.gen(function* () {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 500)

		try {
			const response = yield* Effect.tryPromise({
				try: () =>
					fetch(`http://127.0.0.1:${port}/project/current`, {
						signal: controller.signal,
					}),
				catch: () => null,
			})

			clearTimeout(timeoutId)

			if (!response || !response.ok) return null

			const project = yield* Effect.tryPromise({
				try: () => response.json() as Promise<{ worktree?: string }>,
				catch: () => null,
			})

			if (!project) return null

			const directory = project.worktree
			if (!directory || directory === "/" || directory.length <= 1) {
				return null
			}

			return { port, pid, directory }
		} catch {
			clearTimeout(timeoutId)
			return null
		}
	}).pipe(Effect.catchAll(() => Effect.succeed(null)))
}

// ============================================================================
// SSE Connection - Direct fetch-based streaming
// ============================================================================

/**
 * Connect to a server's SSE endpoint and stream events
 *
 * Uses fetch with ReadableStream (works in Node.js and browsers)
 * Parses SSE format with eventsource-parser
 */
export function connectToSSE(port: number): Stream.Stream<SSEEvent, Error> {
	return Stream.async<SSEEvent, Error>((emit) => {
		const url = `http://127.0.0.1:${port}/global/event`
		let controller: AbortController | null = new AbortController()
		let parser: EventSourceParser | null = null

		// Create SSE parser
		parser = createParser({
			onEvent: (event) => {
				try {
					const data = JSON.parse(event.data)
					// Extract the actual event from the wrapper
					if (data.payload?.type && data.payload?.properties) {
						emit.single({
							type: data.payload.type,
							properties: data.payload.properties,
						})
					}
				} catch (error) {
					// Skip malformed events
				}
			},
		})

		// Start streaming
		;(async () => {
			try {
				const response = await fetch(url, {
					headers: {
						Accept: "text/event-stream",
						"Cache-Control": "no-cache",
					},
					signal: controller?.signal,
				})

				if (!response.ok) {
					emit.fail(new Error(`SSE connection failed: ${response.status}`))
					return
				}

				if (!response.body) {
					emit.fail(new Error("SSE response has no body"))
					return
				}

				const reader = response.body.getReader()
				const decoder = new TextDecoder()

				while (true) {
					const { done, value } = await reader.read()
					if (done) break

					const chunk = decoder.decode(value, { stream: true })
					parser?.feed(chunk)
				}

				emit.end()
			} catch (error) {
				if (error instanceof Error && error.name === "AbortError") {
					emit.end()
					return
				}
				emit.fail(error instanceof Error ? error : new Error(String(error)))
			}
		})()

		// Cleanup
		return Effect.sync(() => {
			controller?.abort()
			controller = null
			parser = null
		})
	})
}

// ============================================================================
// WorldSSE - Main orchestrator
// ============================================================================

/**
 * WorldSSE manages server discovery and SSE connections
 *
 * Feeds events directly to a WorldStore instance.
 * Self-contained - no dependencies on browser APIs or proxy routes.
 */
export class WorldSSE {
	private store: WorldStore
	private config: Required<WorldSSEConfig>
	private running = false
	private discoveryFiber: Fiber.RuntimeFiber<void, Error> | null = null
	private connectionFibers = new Map<number, Fiber.RuntimeFiber<void, Error>>()
	private connectedPorts = new Set<number>()
	private scope: Scope.CloseableScope | null = null // Scope for auto-cleanup

	constructor(store: WorldStore, config: WorldSSEConfig = {}) {
		this.store = store
		this.config = {
			serverUrl: config.serverUrl ?? "",
			discoveryIntervalMs: config.discoveryIntervalMs ?? 5000,
			autoReconnect: config.autoReconnect ?? true,
			maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
			onEvent: config.onEvent ?? (() => {}),
		}
	}

	/**
	 * Start discovery and SSE connections
	 * Creates a Scope for auto-cleanup of fibers
	 */
	start(): void {
		if (this.running) return
		this.running = true
		this.store.setConnectionStatus("connecting")

		// Create scope for fiber lifecycle
		Effect.runPromise(Scope.make()).then((scope) => {
			this.scope = scope
		})

		// If serverUrl is provided, connect directly (skip discovery)
		if (this.config.serverUrl) {
			const url = new URL(this.config.serverUrl)
			const port = parseInt(url.port || "1999", 10)
			this.connectToServer(port)
			return
		}

		// Start discovery loop
		this.startDiscoveryLoop()
	}

	/**
	 * Stop all connections
	 * Closes the Scope, auto-interrupting all fibers
	 */
	stop(): void {
		this.running = false

		// Close scope - this auto-interrupts all fibers created within it
		if (this.scope) {
			Effect.runPromise(Scope.close(this.scope, Exit.succeed(undefined as void))).catch(() => {
				// Ignore close errors
			})
			this.scope = null
		}

		// Cancel discovery (if not using scope-based management yet)
		if (this.discoveryFiber) {
			Effect.runFork(Fiber.interrupt(this.discoveryFiber))
			this.discoveryFiber = null
		}

		// Cancel all connections (manual cleanup still needed for fibers not in scope)
		for (const [port, fiber] of this.connectionFibers) {
			Effect.runFork(Fiber.interrupt(fiber))
		}
		this.connectionFibers.clear()
		this.connectedPorts.clear()

		this.store.setConnectionStatus("disconnected")
	}

	/**
	 * Get list of connected ports
	 */
	getConnectedPorts(): number[] {
		return Array.from(this.connectedPorts)
	}

	/**
	 * Start the discovery loop
	 */
	private startDiscoveryLoop(): void {
		const discoveryEffect = Effect.gen(this, function* () {
			while (this.running) {
				// Discover servers
				const servers = yield* discoverServers().pipe(
					Effect.catchAll(() => Effect.succeed([] as DiscoveredServer[])),
				)

				// Connect to new servers
				const activePorts = new Set(servers.map((s) => s.port))

				for (const server of servers) {
					if (!this.connectedPorts.has(server.port)) {
						this.connectToServer(server.port)
					}
				}

				// Disconnect from dead servers
				for (const port of this.connectedPorts) {
					if (!activePorts.has(port)) {
						this.disconnectFromServer(port)
					}
				}

				// Update connection status
				if (this.connectedPorts.size > 0) {
					this.store.setConnectionStatus("connected")
				} else if (servers.length === 0) {
					this.store.setConnectionStatus("disconnected")
				}

				// Wait before next discovery
				yield* Effect.sleep(this.config.discoveryIntervalMs)
			}
		})

		this.discoveryFiber = Effect.runFork(discoveryEffect)
	}

	/**
	 * Connect to a specific server
	 */
	private connectToServer(port: number): void {
		if (this.connectionFibers.has(port)) return

		const connectionEffect = Effect.gen(this, function* () {
			let attempts = 0

			while (this.running && attempts < this.config.maxReconnectAttempts) {
				try {
					this.connectedPorts.add(port)

					// Bootstrap: fetch initial data
					yield* this.bootstrapFromServer(port)

					// Stream SSE events
					yield* Stream.runForEach(connectToSSE(port), (event) =>
						Effect.sync(() => this.handleEvent(event)),
					)

					// Stream ended normally
					break
				} catch (error) {
					this.connectedPorts.delete(port)
					attempts++

					if (!this.config.autoReconnect || attempts >= this.config.maxReconnectAttempts) {
						break
					}

					// Exponential backoff
					const delay = Math.min(1000 * Math.pow(2, attempts), 30000)
					yield* Effect.sleep(delay)
				}
			}

			this.connectedPorts.delete(port)
			this.connectionFibers.delete(port)
		})

		const fiber = Effect.runFork(connectionEffect)
		this.connectionFibers.set(port, fiber)
	}

	/**
	 * Disconnect from a server
	 */
	private disconnectFromServer(port: number): void {
		const fiber = this.connectionFibers.get(port)
		if (fiber) {
			Effect.runFork(Fiber.interrupt(fiber))
			this.connectionFibers.delete(port)
		}
		this.connectedPorts.delete(port)
	}

	/**
	 * Bootstrap initial data from a server
	 */
	private bootstrapFromServer(port: number): Effect.Effect<void, Error> {
		return Effect.gen(this, function* () {
			const baseUrl = `http://127.0.0.1:${port}`

			// Fetch sessions and status in parallel
			const [sessionsRes, statusRes] = yield* Effect.all([
				Effect.tryPromise({
					try: () => fetch(`${baseUrl}/session`).then((r) => r.json()),
					catch: (e) => new Error(`Failed to fetch sessions: ${e}`),
				}),
				Effect.tryPromise({
					try: () => fetch(`${baseUrl}/session/status`).then((r) => r.json()),
					catch: (e) => new Error(`Failed to fetch status: ${e}`),
				}),
			])

			const sessions = (sessionsRes as Session[]) || []
			const backendStatusMap = (statusRes as Record<string, BackendSessionStatus>) || {}

			// Normalize status
			const statusMap: Record<string, SessionStatus> = {}
			for (const [sessionId, backendStatus] of Object.entries(backendStatusMap)) {
				statusMap[sessionId] = normalizeBackendStatus(backendStatus)
			}

			// Update store
			this.store.setSessions(sessions)
			this.store.setStatus(statusMap)
			this.store.setConnectionStatus("connected")
		})
	}

	/**
	 * Handle incoming SSE event
	 */
	private handleEvent(event: SSEEvent): void {
		const { type, properties } = event

		// Call the event callback for logging/debugging
		// Add source tag for multi-source scenarios
		this.config.onEvent({
			source: "sse",
			type,
			properties,
		})

		switch (type) {
			case "session.created":
			case "session.updated": {
				const session = properties as unknown as Session
				if (session?.id) {
					this.store.upsertSession(session)
				}
				break
			}

			case "message.created":
			case "message.updated": {
				const message = properties as unknown as Message
				if (message?.id) {
					this.store.upsertMessage(message)
				}
				break
			}

			case "part.created":
			case "part.updated": {
				const part = properties as unknown as Part
				if (part?.id) {
					this.store.upsertPart(part)
				}
				break
			}

			case "session.status": {
				const { sessionID, status } = properties as {
					sessionID?: string
					status?: SessionStatus
				}
				if (sessionID && status) {
					this.store.updateStatus(sessionID, status)
				}
				break
			}
		}
	}
}

/**
 * Create a WorldSSE instance connected to a WorldStore
 */
export function createWorldSSE(store: WorldStore, config?: WorldSSEConfig): WorldSSE {
	return new WorldSSE(store, config)
}

// ============================================================================
// SSEService - Effect.Service wrapper
// ============================================================================

/**
 * SSEService interface - Effect.Service wrapper around WorldSSE
 *
 * Provides scoped lifecycle management with Effect.Service pattern.
 * The WorldSSE instance is created on acquire and cleaned up on release.
 */
export interface SSEServiceInterface {
	/**
	 * Start SSE connections
	 */
	start: () => Effect.Effect<void, never, never>

	/**
	 * Stop SSE connections
	 */
	stop: () => Effect.Effect<void, never, never>

	/**
	 * Get connected ports
	 */
	getConnectedPorts: () => Effect.Effect<number[], never, never>
}

/**
 * SSEService tag for dependency injection
 */
export class SSEService extends Context.Tag("SSEService")<SSEService, SSEServiceInterface>() {}

/**
 * SSEService Layer with scoped lifecycle
 *
 * Pattern from cursor-store.ts: Layer.scoped wraps WorldSSE class,
 * providing Effect-native lifecycle management.
 *
 * @param store - WorldStore to feed events into
 * @param config - SSE configuration
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const sseService = yield* SSEService
 *   yield* sseService.start()
 *   // SSE active within scope
 *   yield* Effect.sleep(Duration.seconds(10))
 *   // Auto-cleanup when scope exits
 * })
 *
 * Effect.runPromise(
 *   program.pipe(Effect.provide(SSEServiceLive(store)))
 * )
 * ```
 */
export const SSEServiceLive = (
	store: WorldStore,
	config?: WorldSSEConfig,
): Layer.Layer<SSEService, never, never> =>
	Layer.scoped(
		SSEService,
		Effect.acquireRelease(
			// Acquire: Create WorldSSE instance
			Effect.sync(() => {
				const sse = new WorldSSE(store, config)

				return {
					start: () => Effect.sync(() => sse.start()),
					stop: () => Effect.sync(() => sse.stop()),
					getConnectedPorts: () => Effect.sync(() => sse.getConnectedPorts()),
				}
			}),
			// Release: Stop WorldSSE on scope exit
			(service) => service.stop(),
		),
	)
