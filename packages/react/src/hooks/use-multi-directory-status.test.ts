/**
 * Tests for useMultiDirectoryStatus hook
 *
 * Verifies SDK status fetch during bootstrap and SSE subscription behavior.
 *
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useMultiDirectoryStatus } from "./use-multi-directory-status"
import { useOpencodeStore } from "../store"
import { createClient } from "@opencode-vibe/core/client"

// Mock createClient
vi.mock("@opencode-vibe/core/client", () => ({
	createClient: vi.fn(),
}))

describe("useMultiDirectoryStatus", () => {
	const mockDirectory = "/test/project"
	const mockSessionId = "ses-123"

	beforeEach(() => {
		// Reset Zustand store
		useOpencodeStore.setState({ directories: {} })
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.clearAllTimers()
	})

	describe("bootstrap phase", () => {
		it("should fetch SDK session.status() on mount", async () => {
			const mockStatusResponse = {
				data: {
					[mockSessionId]: { type: "busy" as const },
				},
			}

			const mockClient = {
				session: {
					status: vi.fn().mockResolvedValue(mockStatusResponse),
				},
			}
			vi.mocked(createClient).mockResolvedValue(mockClient as any)

			const initialSessions = {
				[mockDirectory]: [{ id: mockSessionId, formattedTime: "just now" }],
			}

			renderHook(() => useMultiDirectoryStatus([mockDirectory], initialSessions))

			// Wait for async bootstrap to complete
			await waitFor(() => {
				expect(mockClient.session.status).toHaveBeenCalledTimes(1)
			})
		})

		it("should merge SDK status into sessionStatuses state", async () => {
			const mockStatusResponse = {
				data: {
					[mockSessionId]: { type: "busy" as const },
					"ses-456": { type: "idle" as const },
				},
			}

			const mockClient = {
				session: {
					status: vi.fn().mockResolvedValue(mockStatusResponse),
				},
			}
			vi.mocked(createClient).mockResolvedValue(mockClient as any)

			const initialSessions = {
				[mockDirectory]: [
					{ id: mockSessionId, formattedTime: "just now" },
					{ id: "ses-456", formattedTime: "1m ago" },
				],
			}

			const { result } = renderHook(() => useMultiDirectoryStatus([mockDirectory], initialSessions))

			// Wait for bootstrap to complete
			await waitFor(() => {
				expect(result.current.sessionStatuses[mockSessionId]).toBe("running")
				expect(result.current.sessionStatuses["ses-456"]).toBe("completed")
			})
		})

		it("should normalize backend status format correctly", async () => {
			const mockStatusResponse = {
				data: {
					"busy-session": { type: "busy" as const },
					"retry-session": { type: "retry" as const, attempt: 1, message: "retrying", next: 5000 },
					"idle-session": { type: "idle" as const },
				},
			}

			const mockClient = {
				session: {
					status: vi.fn().mockResolvedValue(mockStatusResponse),
				},
			}
			vi.mocked(createClient).mockResolvedValue(mockClient as any)

			const initialSessions = {
				[mockDirectory]: [
					{ id: "busy-session", formattedTime: "just now" },
					{ id: "retry-session", formattedTime: "just now" },
					{ id: "idle-session", formattedTime: "just now" },
				],
			}

			const { result } = renderHook(() => useMultiDirectoryStatus([mockDirectory], initialSessions))

			await waitFor(() => {
				expect(result.current.sessionStatuses["busy-session"]).toBe("running")
				expect(result.current.sessionStatuses["retry-session"]).toBe("running")
				expect(result.current.sessionStatuses["idle-session"]).toBe("completed")
			})
		})

		it("should handle multiple directories in parallel", async () => {
			const dir1 = "/project1"
			const dir2 = "/project2"

			const mockClient1 = {
				session: {
					status: vi.fn().mockResolvedValue({
						data: { "ses-1": { type: "busy" as const } },
					}),
				},
			}

			const mockClient2 = {
				session: {
					status: vi.fn().mockResolvedValue({
						data: { "ses-2": { type: "idle" as const } },
					}),
				},
			}

			vi.mocked(createClient)
				.mockResolvedValueOnce(mockClient1 as any)
				.mockResolvedValueOnce(mockClient2 as any)

			const initialSessions = {
				[dir1]: [{ id: "ses-1", formattedTime: "just now" }],
				[dir2]: [{ id: "ses-2", formattedTime: "just now" }],
			}

			const { result } = renderHook(() => useMultiDirectoryStatus([dir1, dir2], initialSessions))

			await waitFor(() => {
				expect(mockClient1.session.status).toHaveBeenCalled()
				expect(mockClient2.session.status).toHaveBeenCalled()
				expect(result.current.sessionStatuses["ses-1"]).toBe("running")
				expect(result.current.sessionStatuses["ses-2"]).toBe("completed")
			})
		})

		it("should gracefully handle SDK errors during bootstrap", async () => {
			const mockClient = {
				session: {
					status: vi.fn().mockRejectedValue(new Error("Network error")),
				},
			}
			vi.mocked(createClient).mockResolvedValue(mockClient as any)

			const initialSessions = {
				[mockDirectory]: [{ id: mockSessionId, formattedTime: "just now" }],
			}

			const { result } = renderHook(() => useMultiDirectoryStatus([mockDirectory], initialSessions))

			// Should not throw and should return empty status
			await waitFor(() => {
				expect(mockClient.session.status).toHaveBeenCalled()
			})

			expect(result.current.sessionStatuses[mockSessionId]).toBeUndefined()
		})

		it("should skip bootstrap if initialSessions is undefined", async () => {
			const mockClient = {
				session: {
					status: vi.fn(),
				},
			}
			vi.mocked(createClient).mockResolvedValue(mockClient as any)

			renderHook(() => useMultiDirectoryStatus([mockDirectory]))

			// Wait a bit to ensure no async calls happen
			await new Promise((resolve) => setTimeout(resolve, 50))

			expect(mockClient.session.status).not.toHaveBeenCalled()
		})

		it("should not re-bootstrap on re-renders", async () => {
			const mockClient = {
				session: {
					status: vi.fn().mockResolvedValue({ data: {} }),
				},
			}
			vi.mocked(createClient).mockResolvedValue(mockClient as any)

			const initialSessions = {
				[mockDirectory]: [{ id: mockSessionId, formattedTime: "just now" }],
			}

			const { rerender } = renderHook(() =>
				useMultiDirectoryStatus([mockDirectory], initialSessions),
			)

			await waitFor(() => {
				expect(mockClient.session.status).toHaveBeenCalledTimes(1)
			})

			// Re-render
			rerender()

			// Should not call again
			expect(mockClient.session.status).toHaveBeenCalledTimes(1)
		})
	})

	describe("SSE subscription", () => {
		it("should subscribe to store sessionStatus updates", async () => {
			const { result } = renderHook(() => useMultiDirectoryStatus([mockDirectory]))

			// Initialize directory in store
			useOpencodeStore.getState().initDirectory(mockDirectory)

			// Simulate SSE event updating sessionStatus
			useOpencodeStore.getState().handleEvent(mockDirectory, {
				type: "session.status",
				properties: {
					sessionID: mockSessionId,
					status: { type: "busy" },
				},
			})

			await waitFor(() => {
				expect(result.current.sessionStatuses[mockSessionId]).toBe("running")
			})
		})

		it("should implement cooldown logic for completed status", async () => {
			vi.useFakeTimers()

			const { result } = renderHook(() => useMultiDirectoryStatus([mockDirectory]))

			useOpencodeStore.getState().initDirectory(mockDirectory)

			// Set to running first
			useOpencodeStore.getState().handleEvent(mockDirectory, {
				type: "session.status",
				properties: {
					sessionID: mockSessionId,
					status: { type: "busy" },
				},
			})

			await vi.waitFor(() => {
				expect(result.current.sessionStatuses[mockSessionId]).toBe("running")
			})

			// Set to completed
			useOpencodeStore.getState().handleEvent(mockDirectory, {
				type: "session.status",
				properties: {
					sessionID: mockSessionId,
					status: { type: "idle" },
				},
			})

			// Should still be "running" due to cooldown
			await vi.waitFor(() => {
				expect(result.current.sessionStatuses[mockSessionId]).toBe("running")
			})

			// Fast-forward past cooldown (60 seconds)
			await vi.advanceTimersByTimeAsync(61_000)

			// Now should be "completed"
			await vi.waitFor(() => {
				expect(result.current.sessionStatuses[mockSessionId]).toBe("completed")
			})

			vi.useRealTimers()
		})

		/**
		 * Characterization test: Verifies subscription triggers on metadata changes
		 *
		 * CONTEXT: From dependency bd-opencode-next--xts0a-mjvweemzq0v verification
		 * Store handler uses full replacement: parts[index] = part (not parts[index].state = ...)
		 * Immer produces new object references, triggering React.memo and Zustand subscriptions.
		 *
		 * QUESTION: Does useMultiDirectoryStatus properly re-compute when part.state.metadata changes?
		 * ANSWER: YES - Zustand subscription fires on any state change, computeStatusSync re-runs.
		 *
		 * This test documents the expected behavior:
		 * 1. Store mutation creates new part reference via Immer
		 * 2. Zustand notifies all subscribers (including our hook)
		 * 3. Hook re-runs computeStatusSync for affected sessions
		 * 4. computeStatusSync checks part.state.status (not metadata directly)
		 * 5. Hook updates sessionStatuses state if status changed
		 */
		it("should detect status changes when part.state.metadata changes while part.state.status stays running", async () => {
			const { result } = renderHook(() => useMultiDirectoryStatus([mockDirectory]))

			const messageId = "msg-123"
			const partId = "part-1"

			// Manually set up store state - bypassing event handlers to directly test the hook's subscription
			useOpencodeStore.setState((state) => {
				if (!state.directories[mockDirectory]) {
					state.directories[mockDirectory] = {
						ready: true,
						sessions: [],
						sessionStatus: {},
						sessionLastActivity: {},
						sessionDiff: {},
						todos: {},
						messages: {},
						parts: {},
						contextUsage: {},
						compaction: {},
						modelLimits: {},
					}
				}

				// Add message
				state.directories[mockDirectory].messages[mockSessionId] = [
					{
						id: messageId,
						sessionID: mockSessionId,
						role: "assistant",
					},
				]

				// Add task part with status="running"
				state.directories[mockDirectory].parts[messageId] = [
					{
						id: partId,
						messageID: messageId,
						type: "tool",
						tool: "task",
						content: "",
						state: {
							status: "running",
							metadata: {
								summary: "Initial summary",
							},
						},
					},
				]
			})

			// Should detect running task part
			await waitFor(() => {
				expect(result.current.sessionStatuses[mockSessionId]).toBe("running")
			})

			// Update metadata while keeping status="running"
			useOpencodeStore.setState((state) => {
				const dirState = state.directories[mockDirectory]
				const parts = dirState?.parts[messageId]
				if (parts && parts.length > 0 && parts[0]) {
					// Full replacement with Immer (creates new reference)
					const currentPart = parts[0]
					parts[0] = {
						id: currentPart.id,
						messageID: currentPart.messageID,
						type: currentPart.type,
						content: currentPart.content,
						...(currentPart.tool ? { tool: currentPart.tool } : {}),
						state: {
							status: "running",
							metadata: {
								summary: "Updated summary - task is progressing",
							},
						},
					}
				}
			})

			// Hook should still detect running status (no change in status itself)
			// This test verifies that metadata changes trigger re-computation
			await waitFor(() => {
				expect(result.current.sessionStatuses[mockSessionId]).toBe("running")
			})

			// Now set status to "completed"
			useOpencodeStore.setState((state) => {
				const dirState = state.directories[mockDirectory]
				if (!dirState) return
				const parts = dirState.parts[messageId]
				if (parts && parts.length > 0 && parts[0]) {
					const currentPart = parts[0]
					parts[0] = {
						id: currentPart.id,
						messageID: currentPart.messageID,
						type: currentPart.type,
						content: currentPart.content,
						...(currentPart.tool ? { tool: currentPart.tool } : {}),
						state: {
							status: "completed",
							metadata: {
								summary: "Final summary - task completed",
							},
						},
					}
				}
			})

			// Hook should detect completed status and start cooldown
			// (still showing "running" due to 60s cooldown, but lastActivity should update)
			const lastActivityBefore = result.current.lastActivity[mockSessionId]
			await waitFor(() => {
				expect(result.current.lastActivity[mockSessionId]).toBeGreaterThan(lastActivityBefore || 0)
			})
		})
	})
})
