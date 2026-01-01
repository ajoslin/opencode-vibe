/**
 * Type tests for world stream types
 */

import { describe, expect, it } from "vitest"
import type {
	EnrichedMessage,
	EnrichedSession,
	WorldState,
	WorldStreamConfig,
	WorldStreamHandle,
} from "./types.js"

describe("WorldStream Types", () => {
	it("EnrichedSession extends Session with computed properties", () => {
		const enrichedSession: EnrichedSession = {
			id: "ses-123",
			title: "Test Session",
			directory: "/test",
			time: { created: Date.now(), updated: Date.now() },
			status: "running",
			isActive: true,
			messages: [],
			unreadCount: 0,
			contextUsagePercent: 45.5,
			lastActivityAt: Date.now(),
		}

		expect(enrichedSession.id).toBe("ses-123")
		expect(enrichedSession.status).toBe("running")
		expect(enrichedSession.isActive).toBe(true)
		expect(enrichedSession.contextUsagePercent).toBe(45.5)
	})

	it("EnrichedMessage extends Message with parts", () => {
		const enrichedMessage: EnrichedMessage = {
			id: "msg-123",
			sessionID: "ses-123",
			role: "assistant",
			parts: [
				{
					id: "part-1",
					messageID: "msg-123",
					type: "text",
					content: "Hello",
				},
			],
			isStreaming: true,
		}

		expect(enrichedMessage.parts).toHaveLength(1)
		expect(enrichedMessage.isStreaming).toBe(true)
	})

	it("WorldState has complete structure", () => {
		const worldState: WorldState = {
			sessions: [],
			activeSessionCount: 1,
			activeSession: null,
			connectionStatus: "connected",
			lastUpdated: Date.now(),
		}

		expect(worldState.sessions).toEqual([])
		expect(worldState.activeSessionCount).toBe(1)
		expect(worldState.connectionStatus).toBe("connected")
	})

	it("WorldStreamConfig has reasonable defaults", () => {
		const config: WorldStreamConfig = {}

		// Type checks - config is optional
		expect(config.baseUrl).toBeUndefined()
		expect(config.maxSessions).toBeUndefined()
		expect(config.autoReconnect).toBeUndefined()
	})

	it("WorldStreamHandle has required methods", () => {
		// This is a type-only test - we're just checking the interface compiles
		const handle: Partial<WorldStreamHandle> = {
			subscribe: (callback: (state: WorldState) => void) => () => {},
			getSnapshot: async () => ({
				sessions: [],
				activeSessionCount: 0,
				activeSession: null,
				connectionStatus: "disconnected",
				lastUpdated: Date.now(),
			}),
			dispose: async () => {},
		}

		expect(handle.subscribe).toBeDefined()
		expect(handle.getSnapshot).toBeDefined()
		expect(handle.dispose).toBeDefined()
	})
})
