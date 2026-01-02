/**
 * Tests for WorldState adapter
 */

import { describe, it, expect } from "vitest"
import { adaptCoreWorldState } from "./world-state.js"
import type { WorldState as CoreWorldState } from "@opencode-vibe/core/world"

describe("adaptCoreWorldState", () => {
	it("converts empty core WorldState to CLI WorldState", () => {
		const coreState: CoreWorldState = {
			sessions: [],
			activeSessionCount: 0,
			activeSession: null,
			connectionStatus: "disconnected",
			lastUpdated: Date.now(),
		}

		const cliState = adaptCoreWorldState(coreState)

		expect(cliState.projects).toEqual([])
		expect(cliState.totalSessions).toBe(0)
		expect(cliState.activeSessions).toBe(0)
		expect(cliState.streamingSessions).toBe(0)
	})

	it("groups sessions by directory (projectKey)", () => {
		const now = Date.now()
		const coreState: CoreWorldState = {
			sessions: [
				{
					id: "session-1",
					title: "Session 1",
					directory: "/project-a",
					time: { created: now, updated: now },
					status: "running",
					isActive: true,
					messages: [],
					unreadCount: 0,
					contextUsagePercent: 0,
					lastActivityAt: now,
				},
				{
					id: "session-2",
					title: "Session 2",
					directory: "/project-a",
					time: { created: now, updated: now },
					status: "completed",
					isActive: false,
					messages: [],
					unreadCount: 0,
					contextUsagePercent: 0,
					lastActivityAt: now - 1000,
				},
				{
					id: "session-3",
					title: "Session 3",
					directory: "/project-b",
					time: { created: now, updated: now },
					status: "running",
					isActive: true,
					messages: [],
					unreadCount: 0,
					contextUsagePercent: 0,
					lastActivityAt: now,
				},
			],
			activeSessionCount: 2,
			activeSession: null,
			connectionStatus: "connected",
			lastUpdated: now,
		}

		const cliState = adaptCoreWorldState(coreState)

		// Should have 2 projects
		expect(cliState.projects).toHaveLength(2)

		// Project A should have 2 sessions
		const projectA = cliState.projects.find((p) => p.directory === "/project-a")
		expect(projectA).toBeDefined()
		expect(projectA?.sessions).toHaveLength(2)
		expect(projectA?.activeCount).toBe(1)

		// Project B should have 1 session
		const projectB = cliState.projects.find((p) => p.directory === "/project-b")
		expect(projectB).toBeDefined()
		expect(projectB?.sessions).toHaveLength(1)
		expect(projectB?.activeCount).toBe(1)

		// Sessions should have projectKey set to directory
		expect(projectA?.sessions[0]?.projectKey).toBe("/project-a")
		expect(projectB?.sessions[0]?.projectKey).toBe("/project-b")
	})

	it("maps core status to CLI status", () => {
		const now = Date.now()
		const coreState: CoreWorldState = {
			sessions: [
				{
					id: "session-1",
					title: "Running",
					directory: "/project",
					time: { created: now, updated: now },
					status: "running",
					isActive: true,
					messages: [],
					unreadCount: 0,
					contextUsagePercent: 0,
					lastActivityAt: now,
				},
				{
					id: "session-2",
					title: "Completed",
					directory: "/project",
					time: { created: now, updated: now },
					status: "completed",
					isActive: false,
					messages: [],
					unreadCount: 0,
					contextUsagePercent: 0,
					lastActivityAt: now,
				},
			],
			activeSessionCount: 1,
			activeSession: null,
			connectionStatus: "connected",
			lastUpdated: now,
		}

		const cliState = adaptCoreWorldState(coreState)

		const project = cliState.projects[0]!
		expect(project.sessions.find((s) => s.id === "session-1")?.status).toBe("active")
		expect(project.sessions.find((s) => s.id === "session-2")?.status).toBe("completed")
	})

	it("detects streaming sessions", () => {
		const now = Date.now()
		const coreState: CoreWorldState = {
			sessions: [
				{
					id: "session-1",
					title: "Streaming",
					directory: "/project",
					time: { created: now, updated: now },
					status: "running",
					isActive: true,
					messages: [
						{
							id: "msg-1",
							sessionID: "session-1",
							role: "assistant",
							parts: [],
							isStreaming: true, // This message is streaming
						},
					],
					unreadCount: 0,
					contextUsagePercent: 0,
					lastActivityAt: now,
				},
			],
			activeSessionCount: 1,
			activeSession: null,
			connectionStatus: "connected",
			lastUpdated: now,
		}

		const cliState = adaptCoreWorldState(coreState)

		expect(cliState.streamingSessions).toBe(1)
		expect(cliState.projects[0]?.sessions[0]?.isStreaming).toBe(true)
	})
})
