/**
 * SSE Bridge Tests
 *
 * Tests for the SSE-to-WorldStore bridge that processes real-time events
 * from MultiServerSSE and updates the WorldStore accordingly.
 *
 * ## Integration Example
 *
 * ```typescript
 * import { WorldStore } from "@opencode-vibe/core/world"
 * import { createSSEBridge } from "@opencode-vibe/core/world"
 * import { multiServerSSE } from "@opencode-vibe/core/sse"
 *
 * // Create store and bridge
 * const store = new WorldStore()
 * const bridge = createSSEBridge(store)
 *
 * // Connect SSE to bridge
 * multiServerSSE.onEvent((event) => {
 *   bridge.processEvent(event)
 * })
 *
 * // Subscribe to state changes
 * store.subscribe((state) => {
 *   console.log("World state updated:", state.sessions.length, "sessions")
 * })
 *
 * // Start SSE
 * multiServerSSE.start()
 * ```
 */

import { describe, expect, it } from "vitest"
import { WorldStore } from "./atoms.js"
import { createSSEBridge } from "./sse-bridge.js"
import type { Session, Message, Part } from "../types/domain.js"

describe("SSE Bridge", () => {
	describe("session.created events", () => {
		it("should upsert session into WorldStore on session.created event", () => {
			const store = new WorldStore()
			const bridge = createSSEBridge(store)

			const session: Session = {
				id: "session-1",
				title: "Test Session",
				directory: "/test/dir",
				time: {
					created: Date.now(),
					updated: Date.now(),
				},
			}

			// Process session.created event
			bridge.processEvent({
				directory: "/test/dir",
				payload: {
					type: "session.created",
					properties: {
						info: session,
					},
				},
			})

			// Verify session was added to store
			const state = store.getState()
			expect(state.sessions).toHaveLength(1)
			expect(state.sessions[0].id).toBe("session-1")
			expect(state.sessions[0].title).toBe("Test Session")
		})
	})

	describe("message.updated events", () => {
		it("should upsert message into WorldStore on message.updated event", () => {
			const store = new WorldStore()
			const bridge = createSSEBridge(store)

			const message: Message = {
				id: "msg-1",
				sessionID: "session-1",
				role: "user",
				time: { created: Date.now() },
			}

			// Process message.updated event
			bridge.processEvent({
				directory: "/test/dir",
				payload: {
					type: "message.updated",
					properties: {
						info: message,
					},
				},
			})

			// Verify message was added to store
			const state = store.getState()
			expect(state.sessions).toHaveLength(0) // No sessions yet

			// Access raw data to check messages (before enrichment)
			const messages = (store as any).data.messages
			expect(messages).toHaveLength(1)
			expect(messages[0].id).toBe("msg-1")
			expect(messages[0].sessionID).toBe("session-1")
		})
	})

	describe("message.part.updated events", () => {
		it("should upsert part into WorldStore on message.part.updated event", () => {
			const store = new WorldStore()
			const bridge = createSSEBridge(store)

			const part: Part = {
				id: "part-1",
				messageID: "msg-1",
				type: "text",
				content: "Hello world",
			}

			// Process message.part.updated event
			bridge.processEvent({
				directory: "/test/dir",
				payload: {
					type: "message.part.updated",
					properties: {
						part: part,
					},
				},
			})

			// Verify part was added to store
			const parts = (store as any).data.parts
			expect(parts).toHaveLength(1)
			expect(parts[0].id).toBe("part-1")
			expect(parts[0].messageID).toBe("msg-1")
			expect(parts[0].content).toBe("Hello world")
		})
	})

	describe("session.status events", () => {
		it("should update session status on session.status event", () => {
			const store = new WorldStore()
			const bridge = createSSEBridge(store)

			// Process session.status event
			bridge.processEvent({
				directory: "/test/dir",
				payload: {
					type: "session.status",
					properties: {
						sessionID: "session-1",
						status: "running",
					},
				},
			})

			// Verify status was updated
			const status = (store as any).data.status
			expect(status["session-1"]).toBe("running")
		})
	})

	describe("multiple events in sequence", () => {
		it("should process multiple events and maintain state", () => {
			const store = new WorldStore()
			const bridge = createSSEBridge(store)

			// Create session
			const session: Session = {
				id: "session-1",
				title: "Test Session",
				directory: "/test/dir",
				time: {
					created: Date.now(),
					updated: Date.now(),
				},
			}

			bridge.processEvent({
				directory: "/test/dir",
				payload: {
					type: "session.created",
					properties: { info: session },
				},
			})

			// Add message
			const message: Message = {
				id: "msg-1",
				sessionID: "session-1",
				role: "user",
				time: { created: Date.now() },
			}

			bridge.processEvent({
				directory: "/test/dir",
				payload: {
					type: "message.updated",
					properties: { info: message },
				},
			})

			// Add part
			const part: Part = {
				id: "part-1",
				messageID: "msg-1",
				type: "text",
				content: "Hello",
			}

			bridge.processEvent({
				directory: "/test/dir",
				payload: {
					type: "message.part.updated",
					properties: { part: part },
				},
			})

			// Update status
			bridge.processEvent({
				directory: "/test/dir",
				payload: {
					type: "session.status",
					properties: {
						sessionID: "session-1",
						status: "running",
					},
				},
			})

			// Verify enriched state
			const state = store.getState()
			expect(state.sessions).toHaveLength(1)
			expect(state.sessions[0].id).toBe("session-1")
			expect(state.sessions[0].status).toBe("running")
			expect(state.sessions[0].messages).toHaveLength(1)
			expect(state.sessions[0].messages[0].id).toBe("msg-1")
			expect(state.sessions[0].messages[0].parts).toHaveLength(1)
			expect(state.sessions[0].messages[0].parts[0].content).toBe("Hello")
		})
	})
})
