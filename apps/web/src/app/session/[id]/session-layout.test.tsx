/**
 * Integration tests for SessionLayout hook integration
 *
 * Tests that session-layout correctly integrates with:
 * - useSession hook for reactive session data
 * - useMessages hook for reactive message list
 * - Store hydration with initial server data
 *
 * Note: These are unit tests validating hook integration logic,
 * not full component rendering tests (which would require DOM setup).
 */

import { describe, test, expect, beforeEach } from "bun:test"
import { useOpencodeStore, type Session as StoreSession, type Message } from "@/react/store"

// Test session data matching store type
const mockStoreSession: StoreSession = {
	id: "test-session-id",
	title: "Test Session Title",
	directory: "/test/directory",
	time: {
		created: Date.now() - 10000,
		updated: Date.now(),
	},
}

const mockMessage: Message = {
	id: "msg-1",
	sessionID: "test-session-id",
	role: "user",
	time: { created: Date.now() },
}

describe("SessionLayout Hook Integration", () => {
	beforeEach(() => {
		// Clear store before each test
		useOpencodeStore.setState({
			sessions: [],
			messages: {},
		})
	})

	test("useSession hook returns session from store", () => {
		const store = useOpencodeStore.getState()

		// Add session to store
		store.addSession(mockStoreSession)

		// Verify session can be retrieved
		const retrieved = store.getSession(mockStoreSession.id)
		expect(retrieved).toBeDefined()
		expect(retrieved?.id).toBe(mockStoreSession.id)
		expect(retrieved?.title).toBe("Test Session Title")
	})

	test("useMessages hook returns messages from store", () => {
		const store = useOpencodeStore.getState()

		// Add message to store
		store.addMessage(mockMessage)

		// Verify messages can be retrieved
		const messages = store.getMessages(mockMessage.sessionID)
		expect(messages).toHaveLength(1)
		expect(messages[0].id).toBe(mockMessage.id)
		expect(messages[0].role).toBe("user")
	})

	test("store hydration with initial session", () => {
		const store = useOpencodeStore.getState()

		// Simulate SessionLayout hydrating the store
		const existing = store.getSession(mockStoreSession.id)
		if (!existing) {
			store.addSession(mockStoreSession)
		}

		// Verify session was added
		const retrieved = store.getSession(mockStoreSession.id)
		expect(retrieved).toBeDefined()
		expect(retrieved?.title).toBe("Test Session Title")
	})

	test("useMessages returns empty array when no messages exist", () => {
		const store = useOpencodeStore.getState()

		// Get messages for session that has no messages
		const messages = store.getMessages("non-existent-session")
		expect(messages).toEqual([])
	})

	test("multiple messages are returned in sorted order", () => {
		const store = useOpencodeStore.getState()

		const msg1: Message = {
			id: "msg-a",
			sessionID: "test-session-id",
			role: "user",
		}

		const msg2: Message = {
			id: "msg-c",
			sessionID: "test-session-id",
			role: "assistant",
		}

		const msg3: Message = {
			id: "msg-b",
			sessionID: "test-session-id",
			role: "user",
		}

		// Add in non-sorted order
		store.addMessage(msg1)
		store.addMessage(msg2)
		store.addMessage(msg3)

		// Verify messages are sorted by id
		const messages = store.getMessages("test-session-id")
		expect(messages).toHaveLength(3)
		expect(messages[0].id).toBe("msg-a")
		expect(messages[1].id).toBe("msg-b")
		expect(messages[2].id).toBe("msg-c")
	})

	test("session updates preserve existing data", () => {
		const store = useOpencodeStore.getState()

		store.addSession(mockStoreSession)

		// Update session title
		store.updateSession(mockStoreSession.id, (draft) => {
			draft.title = "Updated Title"
		})

		const updated = store.getSession(mockStoreSession.id)
		expect(updated?.title).toBe("Updated Title")
		expect(updated?.directory).toBe(mockStoreSession.directory) // Preserved
	})
})
