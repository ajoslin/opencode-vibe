/**
 * Unit tests for useMessages hook
 *
 * Tests that useMessages:
 * 1. Returns messages from store for a session
 * 2. Subscribes to message.created events
 * 3. Subscribes to message.updated events
 * 4. Subscribes to message.part.updated events
 * 5. Deduplicates message.created events
 * 6. Unsubscribes on unmount
 */

// Set up DOM environment for React Testing Library
import { Window } from "happy-dom"
const window = new Window()
// @ts-ignore - happy-dom types don't perfectly match DOM types, but work at runtime
globalThis.document = window.document
// @ts-ignore - happy-dom types don't perfectly match DOM types, but work at runtime
globalThis.window = window

import { describe, it, expect, beforeEach, mock } from "bun:test"
import { renderHook, act } from "@testing-library/react"
import { useOpencodeStore, type Message } from "./store"

// Capture subscribe callbacks for testing
type SubscribeCallback = (event: any) => void
let subscribeCallbacks: Map<string, Set<SubscribeCallback>>
let mockUnsubscribeFns: Array<ReturnType<typeof mock>>
let mockSubscribe: ReturnType<typeof mock>

// Reset mocks before each test
function resetMocks() {
	subscribeCallbacks = new Map()
	mockUnsubscribeFns = []

	mockSubscribe = mock((eventType: string, callback: SubscribeCallback) => {
		if (!subscribeCallbacks.has(eventType)) {
			subscribeCallbacks.set(eventType, new Set())
		}
		subscribeCallbacks.get(eventType)!.add(callback)

		const unsubscribe = mock(() => {
			subscribeCallbacks.get(eventType)?.delete(callback)
		})
		mockUnsubscribeFns.push(unsubscribe)
		return unsubscribe
	})
}

// Mock useSSE - must include all exports to avoid conflicts with other test files
mock.module("./use-sse", () => ({
	useSSE: () => ({
		subscribe: (...args: any[]) => mockSubscribe(...args),
		connected: true,
		reconnect: () => {},
	}),
	SSEProvider: ({ children }: { children: any }) => children,
	useSSEDirect: () => ({ reconnect: () => {} }),
}))

// Import after mocking
const { useMessages } = await import("./use-messages")

// Helper to emit events to subscribed callbacks
function emitEvent(eventType: string, event: any) {
	const callbacks = subscribeCallbacks.get(eventType)
	if (callbacks) {
		for (const callback of callbacks) {
			callback(event)
		}
	}
}

describe("useMessages", () => {
	const sessionId = "session-123"

	const testMessage1: Message = {
		id: "msg-001",
		sessionID: sessionId,
		role: "user",
		time: { created: Date.now() - 1000 },
	}

	const testMessage2: Message = {
		id: "msg-002",
		sessionID: sessionId,
		role: "assistant",
		time: { created: Date.now() },
	}

	beforeEach(() => {
		// Reset store
		useOpencodeStore.setState({
			sessions: [],
			messages: {},
		})
		// Reset mocks
		resetMocks()
	})

	it("returns empty array when no messages in store", () => {
		const { result } = renderHook(() => useMessages(sessionId))
		expect(result.current).toEqual([])
	})

	it("returns messages from store for session", () => {
		// Add messages to store
		act(() => {
			useOpencodeStore.getState().addMessage(testMessage1)
			useOpencodeStore.getState().addMessage(testMessage2)
		})

		const { result } = renderHook(() => useMessages(sessionId))
		expect(result.current).toHaveLength(2)
		expect(result.current[0]).toEqual(testMessage1)
		expect(result.current[1]).toEqual(testMessage2)
	})

	it("subscribes to message.created events on mount", () => {
		renderHook(() => useMessages(sessionId))

		expect(mockSubscribe).toHaveBeenCalledWith("message.created", expect.any(Function))
	})

	it("subscribes to message.updated events on mount", () => {
		renderHook(() => useMessages(sessionId))

		expect(mockSubscribe).toHaveBeenCalledWith("message.updated", expect.any(Function))
	})

	it("subscribes to message.part.updated events on mount", () => {
		renderHook(() => useMessages(sessionId))

		expect(mockSubscribe).toHaveBeenCalledWith("message.part.updated", expect.any(Function))
	})

	it("adds message when message.created event fires", () => {
		const { result } = renderHook(() => useMessages(sessionId))

		// Simulate SSE event - sessionID is INSIDE info
		act(() => {
			emitEvent("message.created", {
				payload: {
					type: "message.created",
					properties: { info: testMessage1 },
				},
			})
		})

		// Message should be added
		expect(result.current).toHaveLength(1)
		expect(result.current[0]).toEqual(testMessage1)
	})

	it("ignores message.created events for different sessions", () => {
		const { result } = renderHook(() => useMessages(sessionId))

		// Event for different session - sessionID is INSIDE info
		act(() => {
			emitEvent("message.created", {
				payload: {
					type: "message.created",
					properties: {
						info: { ...testMessage1, sessionID: "different-session" },
					},
				},
			})
		})

		// No messages added
		expect(result.current).toHaveLength(0)
	})

	it("deduplicates message.created events", () => {
		act(() => {
			useOpencodeStore.getState().addMessage(testMessage1)
		})

		const { result } = renderHook(() => useMessages(sessionId))

		// Simulate duplicate event - sessionID is INSIDE info
		act(() => {
			emitEvent("message.created", {
				payload: {
					type: "message.created",
					properties: { info: testMessage1 },
				},
			})
		})

		// Should still have only 1 message
		expect(result.current).toHaveLength(1)
	})

	it("updates message when message.updated event fires", () => {
		act(() => {
			useOpencodeStore.getState().addMessage(testMessage1)
		})

		const { result } = renderHook(() => useMessages(sessionId))

		// Simulate update event - sessionID is INSIDE info
		const updatedMessage = {
			...testMessage1,
			content: "Updated content",
		}

		act(() => {
			emitEvent("message.updated", {
				payload: {
					type: "message.updated",
					properties: { info: updatedMessage },
				},
			})
		})

		// Message should be updated
		expect(result.current[0]).toEqual(updatedMessage)
	})

	it("updates message parts when message.part.updated event fires", () => {
		act(() => {
			useOpencodeStore.getState().addMessage(testMessage1)
		})

		const { result } = renderHook(() => useMessages(sessionId))

		// Simulate part update event - payload has `part` not `info`
		const part = {
			id: "part-001",
			sessionID: sessionId,
			messageID: testMessage1.id,
			type: "tool-call",
			content: "calling tool",
		}

		act(() => {
			emitEvent("message.part.updated", {
				payload: {
					type: "message.part.updated",
					properties: { part },
				},
			})
		})

		// Message should have parts array with the new part
		expect(result.current[0].parts).toEqual([part])
	})

	it("unsubscribes all events on unmount", () => {
		// Reset to get clean count
		resetMocks()

		const { unmount } = renderHook(() => useMessages(sessionId))

		// Should have 3 unsubscribe functions (one for each event type)
		expect(mockUnsubscribeFns).toHaveLength(3)

		unmount()

		// All should have been called
		for (const unsubFn of mockUnsubscribeFns) {
			expect(unsubFn).toHaveBeenCalled()
		}
	})

	it("re-subscribes when sessionId changes", () => {
		// Reset to get clean count
		resetMocks()

		const { rerender } = renderHook(({ id }: { id: string }) => useMessages(id), {
			initialProps: { id: "session-1" },
		})

		// 3 subscriptions initially
		expect(mockSubscribe).toHaveBeenCalledTimes(3)

		// Change sessionId
		rerender({ id: "session-2" })

		// Should have 6 total (3 new subscriptions)
		expect(mockSubscribe).toHaveBeenCalledTimes(6)
	})

	it("returns updated messages from store after manual update", () => {
		act(() => {
			useOpencodeStore.getState().addMessage(testMessage1)
		})

		const { result } = renderHook(() => useMessages(sessionId))

		// Manually update store
		act(() => {
			useOpencodeStore.getState().updateMessage(sessionId, testMessage1.id, (draft) => {
				draft.role = "system"
			})
		})

		expect(result.current[0].role).toBe("system")
	})

	it("handles incremental part updates (streaming)", () => {
		act(() => {
			useOpencodeStore.getState().addMessage(testMessage1)
		})

		const { result } = renderHook(() => useMessages(sessionId))

		// First chunk of text
		const part1 = {
			id: "part-001",
			sessionID: sessionId,
			messageID: testMessage1.id,
			type: "text",
			text: "Hello",
		}

		act(() => {
			emitEvent("message.part.updated", {
				payload: {
					type: "message.part.updated",
					properties: { part: part1 },
				},
			})
		})

		expect(result.current[0].parts).toHaveLength(1)
		expect((result.current[0].parts as any)[0].text).toBe("Hello")

		// Update same part with more text (streaming)
		const part1Updated = {
			...part1,
			text: "Hello world",
		}

		act(() => {
			emitEvent("message.part.updated", {
				payload: {
					type: "message.part.updated",
					properties: { part: part1Updated },
				},
			})
		})

		expect(result.current[0].parts).toHaveLength(1)
		expect((result.current[0].parts as any)[0].text).toBe("Hello world")
	})

	it("sorts parts by ID when multiple parts arrive", () => {
		act(() => {
			useOpencodeStore.getState().addMessage(testMessage1)
		})

		const { result } = renderHook(() => useMessages(sessionId))

		// Parts arrive out of order
		const part3 = {
			id: "part-003",
			sessionID: sessionId,
			messageID: testMessage1.id,
			type: "text",
			text: "Third",
		}

		const part1 = {
			id: "part-001",
			sessionID: sessionId,
			messageID: testMessage1.id,
			type: "text",
			text: "First",
		}

		const part2 = {
			id: "part-002",
			sessionID: sessionId,
			messageID: testMessage1.id,
			type: "text",
			text: "Second",
		}

		act(() => {
			emitEvent("message.part.updated", {
				payload: { type: "message.part.updated", properties: { part: part3 } },
			})
			emitEvent("message.part.updated", {
				payload: { type: "message.part.updated", properties: { part: part1 } },
			})
			emitEvent("message.part.updated", {
				payload: { type: "message.part.updated", properties: { part: part2 } },
			})
		})

		// Should be sorted by ID
		expect(result.current[0].parts).toHaveLength(3)
		expect((result.current[0].parts as any)[0].id).toBe("part-001")
		expect((result.current[0].parts as any)[1].id).toBe("part-002")
		expect((result.current[0].parts as any)[2].id).toBe("part-003")
	})
})
