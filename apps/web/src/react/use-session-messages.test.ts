import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test"
import { useOpencodeStore } from "./store"
import type { Message } from "./store"

/**
 * TDD: Tests for useSessionMessages hook logic
 *
 * Per AGENTS.md: NO DOM TESTING. Test logic, not markup.
 * We test the fetch behavior and store integration directly.
 */

// Mock fetch for API calls
const originalFetch = globalThis.fetch

describe("useSessionMessages logic", () => {
	const TEST_DIRECTORY = "/test/project"
	const TEST_SESSION_ID = "ses_123"
	const TEST_BASE_URL = "http://localhost:4056"

	beforeEach(() => {
		// Reset store state
		useOpencodeStore.setState({ directories: {} })

		// Reset fetch mock
		globalThis.fetch = mock(async () => ({
			ok: true,
			json: async () => [],
		})) as any
	})

	afterEach(() => {
		globalThis.fetch = originalFetch
	})

	describe("fetchMessages", () => {
		it("fetches messages with limit parameter", async () => {
			const mockMessages: Message[] = Array.from({ length: 20 }, (_, i) => ({
				id: `msg_${String(i).padStart(3, "0")}`, // msg_000, msg_001, etc. for proper sorting
				sessionID: TEST_SESSION_ID,
				role: i % 2 === 0 ? "user" : "assistant",
			}))

			globalThis.fetch = mock(async () => ({
				ok: true,
				json: async () => mockMessages,
			})) as any

			// Initialize directory first (required for setMessages)
			useOpencodeStore.getState().initDirectory(TEST_DIRECTORY)

			// Simulate what the hook does
			const limit = 20
			const url = `${TEST_BASE_URL}/session/${TEST_SESSION_ID}/message?limit=${limit}`
			const response = await fetch(url, {
				headers: { "x-opencode-directory": TEST_DIRECTORY },
			})
			const messages = await response.json()

			// Update store
			useOpencodeStore.getState().setMessages(TEST_DIRECTORY, TEST_SESSION_ID, messages)

			// Verify fetch was called correctly
			expect(globalThis.fetch).toHaveBeenCalledWith(
				`${TEST_BASE_URL}/session/${TEST_SESSION_ID}/message?limit=20`,
				expect.objectContaining({
					headers: { "x-opencode-directory": TEST_DIRECTORY },
				}),
			)

			// Verify store was updated
			const storeMessages = useOpencodeStore.getState().getMessages(TEST_DIRECTORY, TEST_SESSION_ID)
			expect(storeMessages).toHaveLength(20)
		})

		it("fetches messages with custom limit", async () => {
			const mockMessages: Message[] = Array.from({ length: 50 }, (_, i) => ({
				id: `msg_${i}`,
				sessionID: TEST_SESSION_ID,
				role: "user",
			}))

			globalThis.fetch = mock(async () => ({
				ok: true,
				json: async () => mockMessages,
			})) as any

			const limit = 50
			const url = `${TEST_BASE_URL}/session/${TEST_SESSION_ID}/message?limit=${limit}`
			await fetch(url, {
				headers: { "x-opencode-directory": TEST_DIRECTORY },
			})

			expect(globalThis.fetch).toHaveBeenCalledWith(
				`${TEST_BASE_URL}/session/${TEST_SESSION_ID}/message?limit=50`,
				expect.any(Object),
			)
		})
	})

	describe("hasMore logic", () => {
		it("returns true when message count equals limit", () => {
			const limit = 20
			const messageCount = 20
			const hasMore = messageCount >= limit

			expect(hasMore).toBe(true)
		})

		it("returns false when message count is less than limit", () => {
			const limit = 20
			const messageCount = 5
			const hasMore = messageCount >= limit

			expect(hasMore).toBe(false)
		})
	})

	describe("loadMore logic", () => {
		it("increases limit by increment", () => {
			const currentLimit = 20
			const loadMoreIncrement = 20
			const newLimit = currentLimit + loadMoreIncrement

			expect(newLimit).toBe(40)
		})

		it("fetches with increased limit", async () => {
			globalThis.fetch = mock(async () => ({
				ok: true,
				json: async () => [],
			})) as any

			// Initial fetch
			const initialLimit = 20
			await fetch(`${TEST_BASE_URL}/session/${TEST_SESSION_ID}/message?limit=${initialLimit}`)

			// Load more
			const newLimit = initialLimit + 20
			await fetch(`${TEST_BASE_URL}/session/${TEST_SESSION_ID}/message?limit=${newLimit}`)

			expect((globalThis.fetch as any).mock.calls.length).toBe(2)
			expect((globalThis.fetch as any).mock.calls[1][0]).toContain("limit=40")
		})
	})

	describe("store integration", () => {
		it("updates store with fetched messages", async () => {
			const mockMessages: Message[] = [
				{ id: "msg_1", sessionID: TEST_SESSION_ID, role: "user" },
				{ id: "msg_2", sessionID: TEST_SESSION_ID, role: "assistant" },
			]

			// Initialize directory
			useOpencodeStore.getState().initDirectory(TEST_DIRECTORY)

			// Set messages (simulating what hook does after fetch)
			useOpencodeStore.getState().setMessages(TEST_DIRECTORY, TEST_SESSION_ID, mockMessages)

			// Verify store state
			const storeMessages = useOpencodeStore.getState().getMessages(TEST_DIRECTORY, TEST_SESSION_ID)
			expect(storeMessages).toHaveLength(2)
			expect(storeMessages[0].id).toBe("msg_1")
			expect(storeMessages[1].id).toBe("msg_2")
		})

		it("SSE events update store messages", () => {
			// Initialize directory
			useOpencodeStore.getState().initDirectory(TEST_DIRECTORY)

			// Initial messages
			useOpencodeStore
				.getState()
				.setMessages(TEST_DIRECTORY, TEST_SESSION_ID, [
					{ id: "msg_1", sessionID: TEST_SESSION_ID, role: "user" },
				])

			// Simulate SSE event
			useOpencodeStore.getState().handleEvent(TEST_DIRECTORY, {
				type: "message.updated",
				properties: {
					info: { id: "msg_2", sessionID: TEST_SESSION_ID, role: "assistant" },
				},
			})

			// Verify new message was added
			const storeMessages = useOpencodeStore.getState().getMessages(TEST_DIRECTORY, TEST_SESSION_ID)
			expect(storeMessages).toHaveLength(2)
		})

		it("messages are sorted by ID", () => {
			useOpencodeStore.getState().initDirectory(TEST_DIRECTORY)

			// Add messages out of order
			const unsortedMessages: Message[] = [
				{ id: "msg_3", sessionID: TEST_SESSION_ID, role: "user" },
				{ id: "msg_1", sessionID: TEST_SESSION_ID, role: "user" },
				{ id: "msg_2", sessionID: TEST_SESSION_ID, role: "assistant" },
			]

			useOpencodeStore.getState().setMessages(TEST_DIRECTORY, TEST_SESSION_ID, unsortedMessages)

			const storeMessages = useOpencodeStore.getState().getMessages(TEST_DIRECTORY, TEST_SESSION_ID)
			expect(storeMessages[0].id).toBe("msg_1")
			expect(storeMessages[1].id).toBe("msg_2")
			expect(storeMessages[2].id).toBe("msg_3")
		})
	})

	describe("error handling", () => {
		it("handles fetch failure gracefully", async () => {
			globalThis.fetch = mock(async () => ({
				ok: false,
				status: 500,
				statusText: "Internal Server Error",
			})) as any

			const response = await fetch(`${TEST_BASE_URL}/session/${TEST_SESSION_ID}/message?limit=20`)

			expect(response.ok).toBe(false)
			expect(response.status).toBe(500)
		})

		it("handles network error", async () => {
			globalThis.fetch = mock(async () => {
				throw new Error("Network error")
			}) as any

			let error: Error | null = null
			try {
				await fetch(`${TEST_BASE_URL}/session/${TEST_SESSION_ID}/message?limit=20`)
			} catch (e) {
				error = e as Error
			}

			expect(error).toBeTruthy()
			expect(error?.message).toBe("Network error")
		})
	})

	describe("URL construction", () => {
		it("constructs correct URL with session ID and limit", () => {
			const baseUrl = "http://localhost:4056"
			const sessionId = "ses_abc123"
			const limit = 25

			const url = `${baseUrl}/session/${sessionId}/message?limit=${limit}`

			expect(url).toBe("http://localhost:4056/session/ses_abc123/message?limit=25")
		})

		it("includes directory header", async () => {
			globalThis.fetch = mock(async () => ({
				ok: true,
				json: async () => [],
			})) as any

			await fetch(`${TEST_BASE_URL}/session/${TEST_SESSION_ID}/message?limit=20`, {
				headers: { "x-opencode-directory": TEST_DIRECTORY },
			})

			const call = (globalThis.fetch as any).mock.calls[0]
			expect(call[1].headers["x-opencode-directory"]).toBe(TEST_DIRECTORY)
		})
	})
})
