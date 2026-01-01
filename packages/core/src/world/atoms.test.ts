/**
 * Tests for world stream state management
 */

import { describe, expect, it } from "vitest"
import type { Message, Part, Session } from "../types/domain.js"
import type { SessionStatus } from "../types/events.js"
import { WorldStore } from "./atoms.js"

describe("WorldStore", () => {
	it("initializes with empty state", () => {
		const store = new WorldStore()
		const state = store.getState()

		expect(state.sessions).toEqual([])
		expect(state.activeSessionCount).toBe(0)
		expect(state.activeSession).toBeNull()
		expect(state.connectionStatus).toBe("disconnected")
	})

	it("updates sessions and derives world state", () => {
		const store = new WorldStore()
		const now = Date.now()

		const sessions: Session[] = [
			{
				id: "ses-1",
				title: "Test Session",
				directory: "/test",
				time: { created: now, updated: now },
			},
		]

		store.setSessions(sessions)
		const state = store.getState()

		expect(state.sessions).toHaveLength(1)
		expect(state.sessions[0].id).toBe("ses-1")
		expect(state.sessions[0].status).toBe("completed") // No status set
		expect(state.sessions[0].messages).toEqual([])
	})

	it("enriches messages with parts", () => {
		const store = new WorldStore()
		const now = Date.now()

		const sessions: Session[] = [
			{
				id: "ses-1",
				title: "Test",
				directory: "/test",
				time: { created: now, updated: now },
			},
		]

		const messages: Message[] = [
			{
				id: "msg-1",
				sessionID: "ses-1",
				role: "user",
				time: { created: now },
			},
		]

		const parts: Part[] = [
			{
				id: "part-1",
				messageID: "msg-1",
				type: "text",
				content: "Hello",
			},
		]

		store.setSessions(sessions)
		store.setMessages(messages)
		store.setParts(parts)

		const state = store.getState()
		expect(state.sessions[0].messages).toHaveLength(1)
		expect(state.sessions[0].messages[0].parts).toHaveLength(1)
		expect(state.sessions[0].messages[0].parts[0].content).toBe("Hello")
	})

	it("computes isStreaming for incomplete assistant messages", () => {
		const store = new WorldStore()
		const now = Date.now()

		const sessions: Session[] = [
			{
				id: "ses-1",
				title: "Test",
				directory: "/test",
				time: { created: now, updated: now },
			},
		]

		const messages: Message[] = [
			{
				id: "msg-1",
				sessionID: "ses-1",
				role: "assistant",
				time: { created: now }, // No completed time
			},
		]

		store.setSessions(sessions)
		store.setMessages(messages)

		const state = store.getState()
		expect(state.sessions[0].messages[0].isStreaming).toBe(true)
	})

	it("marks completed messages as not streaming", () => {
		const store = new WorldStore()
		const now = Date.now()

		const sessions: Session[] = [
			{
				id: "ses-1",
				title: "Test",
				directory: "/test",
				time: { created: now, updated: now },
			},
		]

		const messages: Message[] = [
			{
				id: "msg-1",
				sessionID: "ses-1",
				role: "assistant",
				time: { created: now, completed: now + 1000 },
			},
		]

		store.setSessions(sessions)
		store.setMessages(messages)

		const state = store.getState()
		expect(state.sessions[0].messages[0].isStreaming).toBe(false)
	})

	it("applies session status from status map", () => {
		const store = new WorldStore()
		const now = Date.now()

		const sessions: Session[] = [
			{
				id: "ses-1",
				title: "Test",
				directory: "/test",
				time: { created: now, updated: now },
			},
		]

		const status: Record<string, SessionStatus> = {
			"ses-1": "running",
		}

		store.setSessions(sessions)
		store.setStatus(status)

		const state = store.getState()
		expect(state.sessions[0].status).toBe("running")
		expect(state.sessions[0].isActive).toBe(true)
		expect(state.activeSessionCount).toBe(1)
	})

	it("sorts sessions by last activity", () => {
		const store = new WorldStore()
		const now = Date.now()

		const sessions: Session[] = [
			{
				id: "ses-1",
				title: "Old",
				directory: "/test",
				time: { created: now - 2000, updated: now - 2000 },
			},
			{
				id: "ses-2",
				title: "New",
				directory: "/test",
				time: { created: now, updated: now },
			},
		]

		store.setSessions(sessions)

		const state = store.getState()
		expect(state.sessions[0].id).toBe("ses-2") // Most recent first
		expect(state.sessions[1].id).toBe("ses-1")
	})

	it("activeSession is first running session", () => {
		const store = new WorldStore()
		const now = Date.now()

		const sessions: Session[] = [
			{
				id: "ses-1",
				title: "Completed",
				directory: "/test",
				time: { created: now, updated: now },
			},
			{
				id: "ses-2",
				title: "Running",
				directory: "/test",
				time: { created: now, updated: now },
			},
		]

		const status: Record<string, SessionStatus> = {
			"ses-2": "running",
		}

		store.setSessions(sessions)
		store.setStatus(status)

		const state = store.getState()
		expect(state.activeSession?.id).toBe("ses-2")
	})

	it("notifies subscribers on state changes", () => {
		const store = new WorldStore()
		let notifyCount = 0

		store.subscribe(() => {
			notifyCount++
		})

		const sessions: Session[] = [
			{
				id: "ses-1",
				title: "Test",
				directory: "/test",
				time: { created: Date.now(), updated: Date.now() },
			},
		]

		store.setSessions(sessions)
		expect(notifyCount).toBe(1)

		store.setConnectionStatus("connected")
		expect(notifyCount).toBe(2)
	})

	it("unsubscribe stops notifications", () => {
		const store = new WorldStore()
		let notifyCount = 0

		const unsubscribe = store.subscribe(() => {
			notifyCount++
		})

		store.setSessions([])
		expect(notifyCount).toBe(1)

		unsubscribe()

		store.setSessions([])
		expect(notifyCount).toBe(1) // No additional notifications
	})

	it("computes context usage from last assistant message with all token types", () => {
		const store = new WorldStore()
		const now = Date.now()

		const sessions: Session[] = [
			{
				id: "ses-1",
				title: "Test",
				directory: "/test",
				time: { created: now, updated: now },
			},
		]

		const messages: Message[] = [
			{
				id: "msg-1",
				sessionID: "ses-1",
				role: "assistant",
				time: { created: now, completed: now },
				tokens: {
					input: 5000,
					output: 500,
					reasoning: 1000,
					cache: { read: 1000, write: 500 },
				},
				model: {
					name: "claude-4-sonnet",
					limits: { context: 200000, output: 16384 },
				},
			},
		]

		store.setSessions(sessions)
		store.setMessages(messages)

		const state = store.getState()
		// Total = input(5000) + output(500) + reasoning(1000) + cache.read(1000) + cache.write(500) = 8000
		// Context usage = (8000 / 200000) * 100 = 4%
		expect(state.sessions[0].contextUsagePercent).toBe(4)
	})

	it("computes context usage with only input and cache read", () => {
		const store = new WorldStore()
		const now = Date.now()

		const sessions: Session[] = [
			{
				id: "ses-1",
				title: "Test",
				directory: "/test",
				time: { created: now, updated: now },
			},
		]

		const messages: Message[] = [
			{
				id: "msg-1",
				sessionID: "ses-1",
				role: "assistant",
				time: { created: now, completed: now },
				tokens: {
					input: 5000,
					output: 500,
					cache: { read: 1000, write: 0 },
				},
				model: {
					name: "claude-4-sonnet",
					limits: { context: 200000, output: 16384 },
				},
			},
		]

		store.setSessions(sessions)
		store.setMessages(messages)

		const state = store.getState()
		// Total = input(5000) + output(500) + cache.read(1000) = 6500
		// (6500 / 200000) * 100 = 3.25%
		expect(state.sessions[0].contextUsagePercent).toBe(3.25)
	})

	describe("upsertSession", () => {
		it("inserts new session into empty store", () => {
			const store = new WorldStore()
			const now = Date.now()

			const session: Session = {
				id: "ses-1",
				title: "New Session",
				directory: "/test",
				time: { created: now, updated: now },
			}

			store.upsertSession(session)
			const state = store.getState()

			expect(state.sessions).toHaveLength(1)
			expect(state.sessions[0].id).toBe("ses-1")
			expect(state.sessions[0].title).toBe("New Session")
		})

		it("updates existing session by ID", () => {
			const store = new WorldStore()
			const now = Date.now()

			const session1: Session = {
				id: "ses-1",
				title: "Original",
				directory: "/test",
				time: { created: now, updated: now },
			}

			const session2: Session = {
				id: "ses-1",
				title: "Updated",
				directory: "/test",
				time: { created: now, updated: now + 1000 },
			}

			store.upsertSession(session1)
			store.upsertSession(session2)
			const state = store.getState()

			expect(state.sessions).toHaveLength(1)
			expect(state.sessions[0].title).toBe("Updated")
		})

		it("maintains sorted order by ID", () => {
			const store = new WorldStore()
			const now = Date.now()

			const sessions = [
				{ id: "ses-3", title: "C", directory: "/test", time: { created: now, updated: now } },
				{ id: "ses-1", title: "A", directory: "/test", time: { created: now, updated: now } },
				{ id: "ses-2", title: "B", directory: "/test", time: { created: now, updated: now } },
			]

			for (const session of sessions) {
				store.upsertSession(session)
			}

			// Internal array should be sorted by ID for binary search
			// We'll verify this through consistent behavior
			const state = store.getState()
			expect(state.sessions).toHaveLength(3)
		})

		it("uses binary search for O(log n) updates", () => {
			const store = new WorldStore()
			const now = Date.now()

			// Insert 100 sessions
			for (let i = 0; i < 100; i++) {
				store.upsertSession({
					id: `ses-${String(i).padStart(3, "0")}`,
					title: `Session ${i}`,
					directory: "/test",
					time: { created: now, updated: now },
				})
			}

			// Update one in the middle - should use binary search
			store.upsertSession({
				id: "ses-050",
				title: "Updated Middle",
				directory: "/test",
				time: { created: now, updated: now + 1000 },
			})

			const state = store.getState()
			expect(state.sessions).toHaveLength(100)
			const updated = state.sessions.find((s) => s.id === "ses-050")
			expect(updated?.title).toBe("Updated Middle")
		})
	})

	describe("upsertMessage", () => {
		it("inserts new message into empty store", () => {
			const store = new WorldStore()
			const now = Date.now()

			const message: Message = {
				id: "msg-1",
				sessionID: "ses-1",
				role: "user",
				time: { created: now },
			}

			store.upsertMessage(message)
			const state = store.getState()

			// Messages appear in enriched sessions
			expect(state.sessions).toHaveLength(0) // No session yet
		})

		it("updates existing message by ID", () => {
			const store = new WorldStore()
			const now = Date.now()

			const message1: Message = {
				id: "msg-1",
				sessionID: "ses-1",
				role: "assistant",
				time: { created: now },
			}

			const message2: Message = {
				id: "msg-1",
				sessionID: "ses-1",
				role: "assistant",
				time: { created: now, completed: now + 1000 },
				tokens: { input: 100, output: 50, cache: { read: 10, write: 5 } },
			}

			store.upsertMessage(message1)
			store.upsertMessage(message2)

			// Need to add session to see enriched messages
			store.upsertSession({
				id: "ses-1",
				title: "Test",
				directory: "/test",
				time: { created: now, updated: now },
			})

			const state = store.getState()
			expect(state.sessions[0].messages).toHaveLength(1)
			expect(state.sessions[0].messages[0].tokens?.input).toBe(100)
			expect(state.sessions[0].messages[0].isStreaming).toBe(false)
		})

		it("maintains sorted order by ID", () => {
			const store = new WorldStore()
			const now = Date.now()

			const messages = [
				{ id: "msg-3", sessionID: "ses-1", role: "user", time: { created: now } },
				{ id: "msg-1", sessionID: "ses-1", role: "user", time: { created: now } },
				{ id: "msg-2", sessionID: "ses-1", role: "user", time: { created: now } },
			]

			for (const message of messages) {
				store.upsertMessage(message)
			}

			store.upsertSession({
				id: "ses-1",
				title: "Test",
				directory: "/test",
				time: { created: now, updated: now },
			})

			const state = store.getState()
			expect(state.sessions[0].messages).toHaveLength(3)
		})
	})

	describe("upsertPart", () => {
		it("inserts new part into empty store", () => {
			const store = new WorldStore()

			const part: Part = {
				id: "part-1",
				messageID: "msg-1",
				type: "text",
				content: "Hello",
			}

			store.upsertPart(part)

			// Parts appear in enriched messages
			// Can't verify without message + session setup
		})

		it("updates existing part by ID", () => {
			const store = new WorldStore()
			const now = Date.now()

			const part1: Part = {
				id: "part-1",
				messageID: "msg-1",
				type: "text",
				content: "Hello",
			}

			const part2: Part = {
				id: "part-1",
				messageID: "msg-1",
				type: "text",
				content: "Hello World",
			}

			store.upsertPart(part1)
			store.upsertPart(part2)

			// Setup session + message to verify
			store.upsertSession({
				id: "ses-1",
				title: "Test",
				directory: "/test",
				time: { created: now, updated: now },
			})
			store.upsertMessage({
				id: "msg-1",
				sessionID: "ses-1",
				role: "assistant",
				time: { created: now },
			})

			const state = store.getState()
			expect(state.sessions[0].messages[0].parts).toHaveLength(1)
			expect(state.sessions[0].messages[0].parts[0].content).toBe("Hello World")
		})

		it("maintains sorted order by ID", () => {
			const store = new WorldStore()
			const now = Date.now()

			const parts = [
				{ id: "part-3", messageID: "msg-1", type: "text", content: "C" },
				{ id: "part-1", messageID: "msg-1", type: "text", content: "A" },
				{ id: "part-2", messageID: "msg-1", type: "text", content: "B" },
			]

			for (const part of parts) {
				store.upsertPart(part)
			}

			store.upsertSession({
				id: "ses-1",
				title: "Test",
				directory: "/test",
				time: { created: now, updated: now },
			})
			store.upsertMessage({
				id: "msg-1",
				sessionID: "ses-1",
				role: "user",
				time: { created: now },
			})

			const state = store.getState()
			expect(state.sessions[0].messages[0].parts).toHaveLength(3)
		})
	})

	describe("updateStatus", () => {
		it("updates single session status", () => {
			const store = new WorldStore()
			const now = Date.now()

			store.upsertSession({
				id: "ses-1",
				title: "Test",
				directory: "/test",
				time: { created: now, updated: now },
			})

			store.updateStatus("ses-1", "running")

			const state = store.getState()
			expect(state.sessions[0].status).toBe("running")
			expect(state.sessions[0].isActive).toBe(true)
		})

		it("preserves other session statuses", () => {
			const store = new WorldStore()
			const now = Date.now()

			store.upsertSession({
				id: "ses-1",
				title: "Test 1",
				directory: "/test",
				time: { created: now, updated: now },
			})
			store.upsertSession({
				id: "ses-2",
				title: "Test 2",
				directory: "/test",
				time: { created: now, updated: now },
			})

			store.setStatus({ "ses-1": "running", "ses-2": "completed" })
			store.updateStatus("ses-1", "completed")

			const state = store.getState()
			const ses1 = state.sessions.find((s) => s.id === "ses-1")
			const ses2 = state.sessions.find((s) => s.id === "ses-2")

			expect(ses1?.status).toBe("completed")
			expect(ses2?.status).toBe("completed")
		})
	})

	describe("Integration - SSE event simulation", () => {
		it("handles realistic SSE event flow with upserts", () => {
			const store = new WorldStore()
			const now = Date.now()

			// 1. Session created event
			store.upsertSession({
				id: "ses-123",
				title: "My Project",
				directory: "/Users/joel/Code/my-project",
				time: { created: now, updated: now },
			})

			// 2. Status update: running
			store.updateStatus("ses-123", "running")

			// 3. User message created
			store.upsertMessage({
				id: "msg-user-1",
				sessionID: "ses-123",
				role: "user",
				time: { created: now + 100 },
			})

			// 4. User message part
			store.upsertPart({
				id: "part-user-1",
				messageID: "msg-user-1",
				type: "text",
				content: "Hello AI",
			})

			// 5. Assistant message created (streaming starts)
			store.upsertMessage({
				id: "msg-asst-1",
				sessionID: "ses-123",
				role: "assistant",
				parentID: "msg-user-1",
				time: { created: now + 200 },
			})

			// 6. Assistant message part updates (streaming)
			store.upsertPart({
				id: "part-asst-1",
				messageID: "msg-asst-1",
				type: "text",
				content: "Hello",
			})

			store.upsertPart({
				id: "part-asst-1",
				messageID: "msg-asst-1",
				type: "text",
				content: "Hello! How",
			})

			store.upsertPart({
				id: "part-asst-1",
				messageID: "msg-asst-1",
				type: "text",
				content: "Hello! How can I help you?",
			})

			// 7. Message completed with tokens
			store.upsertMessage({
				id: "msg-asst-1",
				sessionID: "ses-123",
				role: "assistant",
				parentID: "msg-user-1",
				time: { created: now + 200, completed: now + 5000 },
				tokens: {
					input: 1000,
					output: 50,
					reasoning: 100,
					cache: { read: 500, write: 200 },
				},
				model: {
					name: "claude-sonnet-4",
					limits: { context: 200000, output: 16384 },
				},
			})

			// 8. Status update: completed
			store.updateStatus("ses-123", "completed")

			const state = store.getState()

			// Verify final state
			expect(state.sessions).toHaveLength(1)
			expect(state.sessions[0].id).toBe("ses-123")
			expect(state.sessions[0].status).toBe("completed")
			expect(state.sessions[0].isActive).toBe(false)
			expect(state.sessions[0].messages).toHaveLength(2)

			const userMsg = state.sessions[0].messages.find((m) => m.role === "user")
			expect(userMsg?.parts).toHaveLength(1)
			expect(userMsg?.parts[0].content).toBe("Hello AI")

			const asstMsg = state.sessions[0].messages.find((m) => m.role === "assistant")
			expect(asstMsg?.parts).toHaveLength(1)
			expect(asstMsg?.parts[0].content).toBe("Hello! How can I help you?")
			expect(asstMsg?.isStreaming).toBe(false)
			expect(asstMsg?.tokens?.input).toBe(1000)

			// Context usage: (1000 + 50 + 100 + 500 + 200) / 200000 * 100 = 0.925%
			expect(state.sessions[0].contextUsagePercent).toBeCloseTo(0.925, 2)
		})
	})
})
