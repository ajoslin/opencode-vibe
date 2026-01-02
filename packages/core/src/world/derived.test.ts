/**
 * Derived World Atom Tests - TDD for enrichment logic
 */

import { Atom } from "@effect-atom/atom"
import * as Registry from "@effect-atom/atom/Registry"
import { describe, expect, it, beforeEach } from "vitest"
import type { Message, Part, Session } from "../types/domain.js"
import type { SessionStatus } from "../types/events.js"
import {
	connectionStatusAtom,
	messagesAtom,
	partsAtom,
	sessionsAtom,
	statusAtom,
	worldAtom,
} from "./derived.js"

// Global registry for tests
let registry: Registry.Registry

beforeEach(() => {
	registry = Registry.make()
})

// Test fixtures
const createSession = (overrides: Partial<Session> = {}): Session => ({
	id: "session-1",
	title: "Test Session",
	directory: "/test",
	time: {
		created: 1000,
		updated: 2000,
	},
	...overrides,
})

const createMessage = (overrides: Partial<Message> = {}): Message => ({
	id: "msg-1",
	sessionID: "session-1",
	role: "user",
	time: {
		created: 1500,
	},
	...overrides,
})

const createPart = (overrides: Partial<Part> = {}): Part => ({
	id: "part-1",
	messageID: "msg-1",
	type: "text",
	content: "test part",
	...overrides,
})

describe("worldAtom - Derived State", () => {
	describe("Basic Derivation", () => {
		it("should derive empty world state from empty atoms", () => {
			registry.set(sessionsAtom, [])
			registry.set(messagesAtom, [])
			registry.set(partsAtom, [])
			registry.set(statusAtom, {})
			registry.set(connectionStatusAtom, "disconnected")

			const world = registry.get(worldAtom)

			expect(world.sessions).toEqual([])
			expect(world.activeSessionCount).toBe(0)
			expect(world.activeSession).toBeNull()
			expect(world.connectionStatus).toBe("disconnected")
			expect(world.lastUpdated).toBeGreaterThan(0)
		})

		it("should derive EnrichedSession from base atoms", () => {
			const session = createSession()
			registry.set(sessionsAtom, [session])
			registry.set(messagesAtom, [])
			registry.set(partsAtom, [])
			registry.set(statusAtom, { "session-1": "completed" })
			registry.set(connectionStatusAtom, "disconnected")

			const world = registry.get(worldAtom)

			expect(world.sessions).toHaveLength(1)
			const enriched = world.sessions[0]
			expect(enriched.id).toBe("session-1")
			expect(enriched.status).toBe("completed")
			expect(enriched.isActive).toBe(false)
			expect(enriched.messages).toEqual([])
			expect(enriched.unreadCount).toBe(0)
			expect(enriched.contextUsagePercent).toBe(0)
			expect(enriched.lastActivityAt).toBe(2000) // session.time.updated
		})

		it("should enrich messages with parts", () => {
			const session = createSession()
			const message = createMessage()
			const part = createPart()

			registry.set(sessionsAtom, [session])
			registry.set(messagesAtom, [message])
			registry.set(partsAtom, [part])
			registry.set(statusAtom, { "session-1": "completed" })
			registry.set(connectionStatusAtom, "disconnected")

			const world = registry.get(worldAtom)
			const enrichedSession = world.sessions[0]

			expect(enrichedSession.messages).toHaveLength(1)
			const enrichedMsg = enrichedSession.messages[0]
			expect(enrichedMsg.id).toBe("msg-1")
			expect(enrichedMsg.parts).toHaveLength(1)
			expect(enrichedMsg.parts[0].id).toBe("part-1")
			expect(enrichedMsg.isStreaming).toBe(false)
		})
	})

	describe("Streaming Detection", () => {
		it("should mark assistant message as streaming when not completed", () => {
			const session = createSession()
			const message = createMessage({
				id: "msg-2",
				role: "assistant",
				time: {
					created: 1500,
					// No completed time
				},
			})

			registry.set(sessionsAtom, [session])
			registry.set(messagesAtom, [message])
			registry.set(partsAtom, [])
			registry.set(statusAtom, { "session-1": "running" })
			registry.set(connectionStatusAtom, "connected")

			const world = registry.get(worldAtom)
			const enrichedMsg = world.sessions[0].messages[0]

			expect(enrichedMsg.isStreaming).toBe(true)
		})

		it("should not mark assistant message as streaming when completed", () => {
			const session = createSession()
			const message = createMessage({
				id: "msg-3",
				role: "assistant",
				time: {
					created: 1500,
					completed: 1600,
				},
			})

			registry.set(sessionsAtom, [session])
			registry.set(messagesAtom, [message])
			registry.set(partsAtom, [])
			registry.set(statusAtom, { "session-1": "completed" })
			registry.set(connectionStatusAtom, "connected")

			const world = registry.get(worldAtom)
			const enrichedMsg = world.sessions[0].messages[0]

			expect(enrichedMsg.isStreaming).toBe(false)
		})

		it("should not mark user message as streaming", () => {
			const session = createSession()
			const message = createMessage({
				id: "msg-4",
				role: "user",
				time: {
					created: 1500,
					// No completed time
				},
			})

			registry.set(sessionsAtom, [session])
			registry.set(messagesAtom, [message])
			registry.set(partsAtom, [])
			registry.set(statusAtom, { "session-1": "running" })
			registry.set(connectionStatusAtom, "connected")

			const world = registry.get(worldAtom)
			const enrichedMsg = world.sessions[0].messages[0]

			expect(enrichedMsg.isStreaming).toBe(false)
		})
	})

	describe("Active Session Detection", () => {
		it("should mark session as active when status is running", () => {
			const session = createSession()
			registry.set(sessionsAtom, [session])
			registry.set(messagesAtom, [])
			registry.set(partsAtom, [])
			registry.set(statusAtom, { "session-1": "running" })
			registry.set(connectionStatusAtom, "connected")

			const world = registry.get(worldAtom)

			expect(world.sessions[0].isActive).toBe(true)
			expect(world.activeSessionCount).toBe(1)
			expect(world.activeSession?.id).toBe("session-1")
		})

		it("should not mark session as active when status is completed", () => {
			const session = createSession()
			registry.set(sessionsAtom, [session])
			registry.set(messagesAtom, [])
			registry.set(partsAtom, [])
			registry.set(statusAtom, { "session-1": "completed" })
			registry.set(connectionStatusAtom, "disconnected")

			const world = registry.get(worldAtom)

			expect(world.sessions[0].isActive).toBe(false)
			expect(world.activeSessionCount).toBe(0)
		})

		it("should pick first active session as activeSession", () => {
			const session1 = createSession({ id: "session-1", time: { created: 1000, updated: 2000 } })
			const session2 = createSession({ id: "session-2", time: { created: 1000, updated: 3000 } })

			registry.set(sessionsAtom, [session1, session2])
			registry.set(messagesAtom, [])
			registry.set(partsAtom, [])
			registry.set(statusAtom, {
				"session-1": "completed",
				"session-2": "running",
			})
			registry.set(connectionStatusAtom, "connected")

			const world = registry.get(worldAtom)

			expect(world.activeSession?.id).toBe("session-2")
		})

		it("should fallback to first session when none are active", () => {
			const session1 = createSession({ id: "session-1", time: { created: 1000, updated: 2000 } })
			const session2 = createSession({ id: "session-2", time: { created: 1000, updated: 3000 } })

			registry.set(sessionsAtom, [session1, session2])
			registry.set(messagesAtom, [])
			registry.set(partsAtom, [])
			registry.set(statusAtom, {
				"session-1": "completed",
				"session-2": "completed",
			})
			registry.set(connectionStatusAtom, "disconnected")

			const world = registry.get(worldAtom)

			// Should be session-2 because it's sorted by lastActivityAt descending
			expect(world.activeSession?.id).toBe("session-2")
		})
	})

	describe("Last Activity Tracking", () => {
		it("should use message created time when it's more recent than session updated", () => {
			const session = createSession({ time: { created: 1000, updated: 2000 } })
			const message = createMessage({ time: { created: 3000 } })

			registry.set(sessionsAtom, [session])
			registry.set(messagesAtom, [message])
			registry.set(partsAtom, [])
			registry.set(statusAtom, { "session-1": "completed" })
			registry.set(connectionStatusAtom, "disconnected")

			const world = registry.get(worldAtom)

			expect(world.sessions[0].lastActivityAt).toBe(3000)
		})

		it("should use session updated time when no messages exist", () => {
			const session = createSession({ time: { created: 1000, updated: 2000 } })

			registry.set(sessionsAtom, [session])
			registry.set(messagesAtom, [])
			registry.set(partsAtom, [])
			registry.set(statusAtom, { "session-1": "completed" })
			registry.set(connectionStatusAtom, "disconnected")

			const world = registry.get(worldAtom)

			expect(world.sessions[0].lastActivityAt).toBe(2000)
		})

		it("should sort sessions by lastActivityAt descending", () => {
			const session1 = createSession({ id: "session-1", time: { created: 1000, updated: 2000 } })
			const session2 = createSession({ id: "session-2", time: { created: 1000, updated: 3000 } })
			const session3 = createSession({ id: "session-3", time: { created: 1000, updated: 1500 } })

			registry.set(sessionsAtom, [session1, session2, session3])
			registry.set(messagesAtom, [])
			registry.set(partsAtom, [])
			registry.set(statusAtom, {
				"session-1": "completed",
				"session-2": "completed",
				"session-3": "completed",
			})
			registry.set(connectionStatusAtom, "disconnected")

			const world = registry.get(worldAtom)

			expect(world.sessions.map((s) => s.id)).toEqual(["session-2", "session-1", "session-3"])
		})
	})

	describe("Context Usage Calculation", () => {
		it("should calculate context usage from last assistant message tokens", () => {
			const session = createSession()
			const message = createMessage({
				id: "msg-5",
				role: "assistant",
				tokens: {
					input: 100,
					output: 200,
					reasoning: 50,
					cache: {
						read: 10,
						write: 5,
					},
				},
				model: {
					name: "Claude 3.5 Sonnet",
					limits: {
						context: 1000,
						output: 500,
					},
				},
			})

			registry.set(sessionsAtom, [session])
			registry.set(messagesAtom, [message])
			registry.set(partsAtom, [])
			registry.set(statusAtom, { "session-1": "completed" })
			registry.set(connectionStatusAtom, "disconnected")

			const world = registry.get(worldAtom)
			const enrichedSession = world.sessions[0]

			// (100 + 200 + 50 + 10 + 5) / 1000 * 100 = 36.5
			expect(enrichedSession.contextUsagePercent).toBe(36.5)
		})

		it("should default to 0 when no assistant messages with tokens exist", () => {
			const session = createSession()
			const message = createMessage({ role: "user" })

			registry.set(sessionsAtom, [session])
			registry.set(messagesAtom, [message])
			registry.set(partsAtom, [])
			registry.set(statusAtom, { "session-1": "completed" })
			registry.set(connectionStatusAtom, "disconnected")

			const world = registry.get(worldAtom)

			expect(world.sessions[0].contextUsagePercent).toBe(0)
		})

		it("should use most recent assistant message for context calculation", () => {
			const session = createSession()
			const message1 = createMessage({
				id: "msg-6",
				role: "assistant",
				time: { created: 1500 },
				tokens: {
					input: 100,
					output: 100,
				},
				model: {
					name: "Claude 3.5 Sonnet",
					limits: {
						context: 1000,
						output: 500,
					},
				},
			})
			const message2 = createMessage({
				id: "msg-7",
				role: "assistant",
				time: { created: 2500 },
				tokens: {
					input: 200,
					output: 300,
				},
				model: {
					name: "Claude 3.5 Sonnet",
					limits: {
						context: 1000,
						output: 500,
					},
				},
			})

			registry.set(sessionsAtom, [session])
			registry.set(messagesAtom, [message1, message2])
			registry.set(partsAtom, [])
			registry.set(statusAtom, { "session-1": "completed" })
			registry.set(connectionStatusAtom, "disconnected")

			const world = registry.get(worldAtom)

			// Should use message2: (200 + 300) / 1000 * 100 = 50
			expect(world.sessions[0].contextUsagePercent).toBe(50)
		})
	})

	describe("Reactivity", () => {
		it("should update when sessionsAtom changes", () => {
			registry.set(sessionsAtom, [])
			registry.set(messagesAtom, [])
			registry.set(partsAtom, [])
			registry.set(statusAtom, {})
			registry.set(connectionStatusAtom, "disconnected")

			const world1 = registry.get(worldAtom)
			expect(world1.sessions).toHaveLength(0)

			const session = createSession()
			registry.set(sessionsAtom, [session])
			registry.set(statusAtom, { "session-1": "completed" })

			const world2 = registry.get(worldAtom)
			expect(world2.sessions).toHaveLength(1)
		})

		it("should update when messagesAtom changes", () => {
			const session = createSession()
			registry.set(sessionsAtom, [session])
			registry.set(messagesAtom, [])
			registry.set(partsAtom, [])
			registry.set(statusAtom, { "session-1": "completed" })
			registry.set(connectionStatusAtom, "disconnected")

			const world1 = registry.get(worldAtom)
			expect(world1.sessions[0].messages).toHaveLength(0)

			const message = createMessage()
			registry.set(messagesAtom, [message])

			const world2 = registry.get(worldAtom)
			expect(world2.sessions[0].messages).toHaveLength(1)
		})

		it("should update when partsAtom changes", () => {
			const session = createSession()
			const message = createMessage()

			registry.set(sessionsAtom, [session])
			registry.set(messagesAtom, [message])
			registry.set(partsAtom, [])
			registry.set(statusAtom, { "session-1": "completed" })
			registry.set(connectionStatusAtom, "disconnected")

			const world1 = registry.get(worldAtom)
			expect(world1.sessions[0].messages[0].parts).toHaveLength(0)

			const part = createPart()
			registry.set(partsAtom, [part])

			const world2 = registry.get(worldAtom)
			expect(world2.sessions[0].messages[0].parts).toHaveLength(1)
		})

		it("should update when statusAtom changes", () => {
			const session = createSession()
			registry.set(sessionsAtom, [session])
			registry.set(messagesAtom, [])
			registry.set(partsAtom, [])
			registry.set(statusAtom, { "session-1": "completed" })
			registry.set(connectionStatusAtom, "disconnected")

			const world1 = registry.get(worldAtom)
			expect(world1.sessions[0].isActive).toBe(false)

			registry.set(statusAtom, { "session-1": "running" })

			const world2 = registry.get(worldAtom)
			expect(world2.sessions[0].isActive).toBe(true)
		})

		it("should update when connectionStatusAtom changes", () => {
			registry.set(sessionsAtom, [])
			registry.set(messagesAtom, [])
			registry.set(partsAtom, [])
			registry.set(statusAtom, {})
			registry.set(connectionStatusAtom, "disconnected")

			const world1 = registry.get(worldAtom)
			expect(world1.connectionStatus).toBe("disconnected")

			registry.set(connectionStatusAtom, "connected")

			const world2 = registry.get(worldAtom)
			expect(world2.connectionStatus).toBe("connected")
		})
	})

	describe("Multiple Parts per Message", () => {
		it("should group multiple parts by message ID", () => {
			const session = createSession()
			const message = createMessage()
			const part1 = createPart({ id: "part-1", index: 0 })
			const part2 = createPart({ id: "part-2", index: 1 })
			const part3 = createPart({ id: "part-3", index: 2 })

			registry.set(sessionsAtom, [session])
			registry.set(messagesAtom, [message])
			registry.set(partsAtom, [part1, part2, part3])
			registry.set(statusAtom, { "session-1": "completed" })
			registry.set(connectionStatusAtom, "disconnected")

			const world = registry.get(worldAtom)
			const enrichedMsg = world.sessions[0].messages[0]

			expect(enrichedMsg.parts).toHaveLength(3)
			expect(enrichedMsg.parts.map((p) => p.id)).toEqual(["part-1", "part-2", "part-3"])
		})
	})

	describe("Multiple Messages per Session", () => {
		it("should group multiple messages by session ID", () => {
			const session = createSession()
			const msg1 = createMessage({ id: "msg-1", time: { created: 1500 } })
			const msg2 = createMessage({ id: "msg-2", time: { created: 2500 } })
			const msg3 = createMessage({ id: "msg-3", time: { created: 3500 } })

			registry.set(sessionsAtom, [session])
			registry.set(messagesAtom, [msg1, msg2, msg3])
			registry.set(partsAtom, [])
			registry.set(statusAtom, { "session-1": "completed" })
			registry.set(connectionStatusAtom, "disconnected")

			const world = registry.get(worldAtom)
			const enrichedSession = world.sessions[0]

			expect(enrichedSession.messages).toHaveLength(3)
			expect(enrichedSession.messages.map((m) => m.id)).toEqual(["msg-1", "msg-2", "msg-3"])
		})
	})
})
