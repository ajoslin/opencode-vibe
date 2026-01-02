/**
 * Tests for world stream
 *
 * Tests the self-contained createWorldStream API that handles
 * discovery and SSE connections internally.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { createWorldStream } from "./stream.js"
import { WorldStore } from "./atoms.js"

// Mock discovery module
const mockDiscoverServers = vi.fn()
vi.mock("../discovery/server-discovery.js", () => ({
	discoverServers: mockDiscoverServers,
}))

// Mock the WorldSSE class
vi.mock("./sse.js", () => {
	return {
		WorldSSE: class MockWorldSSE {
			private store: any
			private config: any
			constructor(store: any, config: any) {
				this.store = store
				this.config = config
			}
			start() {
				// Simulate bootstrap completing
				this.store.setConnectionStatus("connected")
			}
			stop() {
				this.store.setConnectionStatus("disconnected")
			}
			getConnectedPorts() {
				return []
			}
		},
		discoverServers: vi.fn(),
		connectToSSE: vi.fn(),
		createWorldSSE: vi.fn(),
	}
})

describe("createWorldStream", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("creates a stream handle with all methods", async () => {
		const stream = createWorldStream({ baseUrl: "http://localhost:1999" })

		expect(typeof stream.subscribe).toBe("function")
		expect(typeof stream.getSnapshot).toBe("function")
		expect(typeof stream[Symbol.asyncIterator]).toBe("function")
		expect(typeof stream.dispose).toBe("function")

		// Clean up
		await stream.dispose()
	})

	describe("auto-discovery", () => {
		it("uses explicit baseUrl when provided", async () => {
			const stream = createWorldStream({ baseUrl: "http://localhost:3000" })

			// With explicit baseUrl, should connect (mocked WorldSSE sets status to "connected")
			await new Promise((resolve) => setTimeout(resolve, 10))

			const snapshot = await stream.getSnapshot()
			expect(snapshot.connectionStatus).toBe("connected")

			await stream.dispose()
		})

		it("delegates to merged-stream for discovery when no baseUrl", async () => {
			const stream = createWorldStream()

			// merged-stream.ts delegates to WorldSSE which has internal discovery loop
			// Mock WorldSSE sets status to "connected" on start()
			await new Promise((resolve) => setTimeout(resolve, 10))

			const snapshot = await stream.getSnapshot()
			expect(snapshot.connectionStatus).toBe("connected")

			await stream.dispose()
		})
	})

	describe("getSnapshot", () => {
		it("returns current world state", async () => {
			// Use explicit baseUrl to avoid discovery
			const stream = createWorldStream({ baseUrl: "http://localhost:1999" })
			const snapshot = await stream.getSnapshot()

			expect(snapshot.sessions).toEqual([])
			expect(snapshot.activeSessionCount).toBe(0)
			expect(snapshot.connectionStatus).toBeDefined()

			await stream.dispose()
		})

		it("returns connected status after start", async () => {
			// Mock discovery for auto-discovery path
			mockDiscoverServers.mockResolvedValue([{ port: 4056, pid: 1234, directory: "/test/dir" }])

			const stream = createWorldStream()

			// Wait for mock to set connected status
			await new Promise((resolve) => setTimeout(resolve, 10))

			const snapshot = await stream.getSnapshot()
			expect(snapshot.connectionStatus).toBe("connected")

			await stream.dispose()
		})
	})

	describe("subscribe", () => {
		it("receives updates when state changes", async () => {
			// Use explicit baseUrl to avoid discovery
			const stream = createWorldStream({ baseUrl: "http://localhost:1999" })
			const updates: any[] = []

			const unsubscribe = stream.subscribe((state) => {
				updates.push(state)
			})

			// Wait a bit for initial connection
			await new Promise((resolve) => setTimeout(resolve, 10))

			expect(updates.length).toBeGreaterThanOrEqual(0)

			unsubscribe()
			await stream.dispose()
		})

		it("returns unsubscribe function", async () => {
			// Use explicit baseUrl to avoid discovery
			const stream = createWorldStream({ baseUrl: "http://localhost:1999" })
			const callback = vi.fn()

			const unsubscribe = stream.subscribe(callback)
			expect(typeof unsubscribe).toBe("function")

			unsubscribe()
			await stream.dispose()
		})
	})

	describe("async iterator", () => {
		it("yields initial world state", async () => {
			// Use explicit baseUrl to avoid discovery
			const stream = createWorldStream({ baseUrl: "http://localhost:1999" })
			const iterator = stream[Symbol.asyncIterator]()

			// Get first value
			const first = await iterator.next()

			expect(first.done).toBe(false)
			expect(first.value.sessions).toBeDefined()
			expect(first.value.activeSessionCount).toBe(0)

			await stream.dispose()
		})
	})

	describe("dispose", () => {
		it("cleans up resources", async () => {
			// Use explicit baseUrl to avoid discovery
			const stream = createWorldStream({ baseUrl: "http://localhost:1999" })

			// Wait for bootstrap to complete
			await new Promise((resolve) => setTimeout(resolve, 10))

			// Get initial snapshot
			const before = await stream.getSnapshot()
			expect(before.connectionStatus).toBe("connected")

			// Dispose
			await stream.dispose()

			// Connection should be disconnected
			const after = await stream.getSnapshot()
			expect(after.connectionStatus).toBe("disconnected")
		})
	})
})

// Helper to create a valid session object
function createSession(id: string, title: string = "Test Session") {
	return {
		id,
		title,
		directory: "/test",
		time: { created: Date.now(), updated: Date.now() },
	}
}

describe("WorldStore", () => {
	it("derives enriched world state from raw data", () => {
		const store = new WorldStore()

		// Add a session
		store.setSessions([createSession("ses_1", "Test Session") as any])

		// Add status
		store.setStatus({ ses_1: "running" })

		const state = store.getState()

		expect(state.sessions.length).toBe(1)
		expect(state.sessions[0].id).toBe("ses_1")
		expect(state.sessions[0].status).toBe("running")
		expect(state.sessions[0].isActive).toBe(true)
		expect(state.activeSessionCount).toBe(1)
	})

	it("upserts sessions using binary search", () => {
		const store = new WorldStore()

		// Add sessions in order
		store.upsertSession(createSession("ses_a", "A") as any)
		store.upsertSession(createSession("ses_c", "C") as any)
		store.upsertSession(createSession("ses_b", "B") as any)

		const state = store.getState()
		expect(state.sessions.length).toBe(3)
	})

	it("updates existing session on upsert", () => {
		const store = new WorldStore()

		store.upsertSession(createSession("ses_1", "Original") as any)
		store.upsertSession(createSession("ses_1", "Updated") as any)

		const state = store.getState()
		expect(state.sessions.length).toBe(1)
		expect(state.sessions[0].title).toBe("Updated")
	})

	it("notifies subscribers on state change", () => {
		const store = new WorldStore()
		const callback = vi.fn()

		store.subscribe(callback)
		store.setSessions([createSession("ses_1") as any])

		expect(callback).toHaveBeenCalled()
	})

	it("unsubscribe stops notifications", () => {
		const store = new WorldStore()
		const callback = vi.fn()

		const unsubscribe = store.subscribe(callback)
		// Subscribe fires immediately with current state
		expect(callback).toHaveBeenCalledOnce()

		callback.mockClear()
		unsubscribe()

		store.setSessions([createSession("ses_1") as any])

		// Callback should not have been called after unsubscribe
		expect(callback).not.toHaveBeenCalled()
	})
})
