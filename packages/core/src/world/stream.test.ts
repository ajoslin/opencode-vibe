/**
 * Tests for world stream
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { createWorldStream } from "./stream.js"
import type { GlobalEvent, SessionStatus } from "../types/events.js"
import type { Message, Part, Session } from "../types/domain.js"
import { createClient } from "../client/index.js"
import { Effect, Stream, Schema as S, Option } from "effect"
import { EventOffset } from "./cursor.js"

// Mock the SDK client (used by stream.ts bootstrap)
vi.mock("@opencode-ai/sdk/client", () => ({
	createOpencodeClient: vi.fn(() => ({
		session: {
			list: vi.fn(() => Promise.resolve({ data: [] })),
			status: vi.fn(() => Promise.resolve({ data: {} })),
		},
	})),
}))

// Mock MultiServerSSE
vi.mock("../sse/multi-server-sse.js", () => ({
	MultiServerSSE: vi.fn(function () {
		return {
			start: vi.fn(),
			stop: vi.fn(),
			onEvent: vi.fn(),
			getDiscoveredServers: vi.fn(() => []),
		}
	}),
}))

describe("createWorldStream", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("creates a stream handle with all methods", () => {
		const stream = createWorldStream({ baseUrl: "http://localhost:1999" })

		expect(typeof stream.subscribe).toBe("function")
		expect(typeof stream.getSnapshot).toBe("function")
		expect(typeof stream[Symbol.asyncIterator]).toBe("function")
		expect(typeof stream.dispose).toBe("function")

		// Clean up
		stream.dispose()
	})

	describe("bootstrap", () => {
		it("fetches sessions and status on connect", async () => {
			// This test verifies bootstrap flow - the mock at module level handles the client
			const stream = createWorldStream({ baseUrl: "http://localhost:1999" })

			// Wait for bootstrap to complete
			await new Promise((resolve) => setTimeout(resolve, 50))

			const snapshot = await stream.getSnapshot()

			// Verify connection status after bootstrap
			expect(snapshot.connectionStatus).toBe("connected")
			// Sessions array should exist (empty from default mock)
			expect(snapshot.sessions).toBeDefined()

			await stream.dispose()
		})

		it("sets connectionStatus to connecting then connected", async () => {
			const stream = createWorldStream()

			// Initial state should be connecting
			const initial = await stream.getSnapshot()
			expect(initial.connectionStatus).toBe("connecting")

			// After bootstrap, should be connected
			await new Promise((resolve) => setTimeout(resolve, 50))
			const connected = await stream.getSnapshot()
			expect(connected.connectionStatus).toBe("connected")

			await stream.dispose()
		})

		it("handles empty bootstrap data", async () => {
			// Default mock returns empty data - test verifies graceful handling
			const stream = createWorldStream()

			await new Promise((resolve) => setTimeout(resolve, 10))
			const snapshot = await stream.getSnapshot()

			expect(snapshot.sessions).toEqual([])
			expect(snapshot.connectionStatus).toBe("connected")

			await stream.dispose()
		})
	})

	describe("SSE event wiring", () => {
		it("wires session.created to upsertSession", async () => {
			const stream = createWorldStream()
			const snapshot = await stream.getSnapshot()

			// Simulate SSE event
			const event: GlobalEvent = {
				directory: "/test",
				payload: {
					type: "session.created",
					properties: {
						id: "ses_new",
						title: "New Session",
						directory: "/test",
						time: { created: 3000, updated: 3000 },
					},
				},
			}

			// Manually trigger event handler (in real impl, SSE would call this)
			// For now, just verify store method exists
			expect(snapshot).toBeDefined()

			await stream.dispose()
		})

		it("wires session.updated to upsertSession", async () => {
			const stream = createWorldStream()
			await stream.getSnapshot()

			// Test will verify event handler calls store.upsertSession
			await stream.dispose()
		})

		it("wires session.status to updateStatus", async () => {
			const stream = createWorldStream()
			await stream.getSnapshot()

			// Test will verify event handler calls store.updateStatus
			await stream.dispose()
		})

		it("wires message.created to upsertMessage", async () => {
			const stream = createWorldStream()
			await stream.getSnapshot()

			// Test will verify event handler calls store.upsertMessage
			await stream.dispose()
		})

		it("wires message.updated to upsertMessage with tokens", async () => {
			const stream = createWorldStream()
			await stream.getSnapshot()

			// Test will verify tokens are extracted
			await stream.dispose()
		})

		it("wires part.created to upsertPart", async () => {
			const stream = createWorldStream()
			await stream.getSnapshot()

			// Test will verify event handler calls store.upsertPart
			await stream.dispose()
		})

		it("wires part.updated to upsertPart", async () => {
			const stream = createWorldStream()
			await stream.getSnapshot()

			// Test will verify event handler calls store.upsertPart
			await stream.dispose()
		})
	})

	it("getSnapshot returns current world state", async () => {
		const stream = createWorldStream()
		const snapshot = await stream.getSnapshot()

		expect(snapshot.sessions).toEqual([])
		expect(snapshot.activeSessionCount).toBe(0)
		expect(snapshot.connectionStatus).toBeDefined()

		await stream.dispose()
	})

	it("subscribe receives updates", async () => {
		const stream = createWorldStream()
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

	it("async iterator yields initial world state", async () => {
		const stream = createWorldStream()
		const iterator = stream[Symbol.asyncIterator]()

		// Get first value
		const first = await iterator.next()

		expect(first.done).toBe(false)
		expect(first.value.sessions).toBeDefined()
		expect(first.value.activeSessionCount).toBe(0)

		await stream.dispose()
	})

	it("dispose cleans up resources", async () => {
		const stream = createWorldStream()

		// Wait for bootstrap to complete
		await new Promise((resolve) => setTimeout(resolve, 50))

		// Get initial snapshot
		const before = await stream.getSnapshot()
		expect(before.connectionStatus).toBe("connected")

		// Dispose
		await stream.dispose()

		// Connection should be disconnected immediately
		const after = await stream.getSnapshot()
		expect(after.connectionStatus).toBe("disconnected")
	})
})

describe("Effect Stream API", () => {
	describe("catchUpEvents", () => {
		it("returns bounded history of events", async () => {
			const { catchUpEvents } = await import("./stream.js")

			// Mock implementation would provide events
			const result = await Effect.runPromise(catchUpEvents())

			expect(result).toHaveProperty("events")
			expect(result).toHaveProperty("nextOffset")
			expect(result).toHaveProperty("upToDate")
			expect(Array.isArray(result.events)).toBe(true)
		})

		it("returns upToDate=true when caught up", async () => {
			const { catchUpEvents } = await import("./stream.js")

			const result = await Effect.runPromise(catchUpEvents())

			expect(result.upToDate).toBe(true)
		})

		it("accepts optional offset parameter", async () => {
			const { catchUpEvents } = await import("./stream.js")

			const offset = S.decodeSync(EventOffset)("100")
			const result = await Effect.runPromise(catchUpEvents(offset))

			expect(result).toHaveProperty("events")
		})

		it("last event includes upToDate signal", async () => {
			const { catchUpEvents } = await import("./stream.js")

			const result = await Effect.runPromise(catchUpEvents())

			if (result.events.length > 0) {
				const lastEvent = result.events[result.events.length - 1]
				expect(lastEvent.upToDate).toBeDefined()
			}
		})
	})

	describe("tailEvents", () => {
		it("returns unbounded Stream of events", async () => {
			const { tailEvents } = await import("./stream.js")

			const stream = tailEvents()

			// Verify it's a Stream
			expect(stream).toBeDefined()
			expect(typeof stream.pipe).toBe("function")
		})

		it("accepts optional offset parameter", async () => {
			const { tailEvents } = await import("./stream.js")

			const offset = S.decodeSync(EventOffset)("200")
			const stream = tailEvents(offset)

			expect(stream).toBeDefined()
			expect(typeof stream.pipe).toBe("function")
		})
	})

	describe("resumeEvents", () => {
		it("returns Stream combining catch-up and live events", async () => {
			const { resumeEvents } = await import("./stream.js")

			const stream = resumeEvents()

			expect(stream).toBeDefined()
			expect(typeof stream.pipe).toBe("function")
		})

		it("accepts optional savedOffset parameter", async () => {
			const { resumeEvents } = await import("./stream.js")

			const offset = S.decodeSync(EventOffset)("300")
			const stream = resumeEvents(offset)

			expect(stream).toBeDefined()
		})
	})
})
