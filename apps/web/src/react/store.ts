/**
 * Zustand store for OpenCode state management with DirectoryState pattern
 *
 * Uses Immer middleware for immutable updates and Binary utilities
 * for O(log n) session/message operations on sorted arrays.
 *
 * Arrays are sorted by ID (lexicographic, ULID-compatible).
 * Each directory has isolated state with sessions, messages, parts, todos, etc.
 */

import { create } from "zustand"
import { immer } from "zustand/middleware/immer"
import { useShallow } from "zustand/react/shallow"
import { Binary } from "@/lib/binary"
import type { GlobalEvent } from "@opencode-ai/sdk/client"

/**
 * Session type matching OpenCode API
 */
export type Session = {
	id: string
	title: string
	directory: string
	parentID?: string
	time: {
		created: number
		updated: number
		archived?: number
	}
}

/**
 * Message type matching OpenCode API
 */
export type Message = {
	id: string
	sessionID: string
	role: string
	parentID?: string // Assistant messages have parentID pointing to user message
	time?: { created: number; completed?: number }
	finish?: string // "stop", "tool-calls", etc. - only set when complete
	[key: string]: unknown // Allow additional fields
}

/**
 * Part type for streaming message content
 */
export type Part = {
	id: string
	messageID: string
	type: string
	content: string
	[key: string]: unknown // Allow additional fields
}

/**
 * Session status literal type
 */
export type SessionStatus = "pending" | "running" | "completed" | "error"

/**
 * Todo type for session tasks
 */
export type Todo = {
	id: string
	sessionID: string
	content: string
	completed: boolean
}

/**
 * File diff type for session changes
 */
export type FileDiff = {
	path: string
	additions: number
	deletions: number
}

/**
 * Directory-scoped state
 */
export interface DirectoryState {
	ready: boolean
	sessions: Session[]
	sessionStatus: Record<string, SessionStatus>
	sessionLastActivity: Record<string, number> // Timestamp of last status change
	sessionDiff: Record<string, FileDiff[]>
	todos: Record<string, Todo[]>
	messages: Record<string, Message[]>
	parts: Record<string, Part[]>
}

/**
 * Store state shape
 */
type OpencodeState = {
	directories: Record<string, DirectoryState>
}

/**
 * Store actions
 */
type OpencodeActions = {
	// Directory management
	initDirectory: (directory: string) => void
	handleEvent: (directory: string, event: { type: string; properties: any }) => void

	// SSE integration
	handleSSEEvent: (event: GlobalEvent) => void

	// Setter actions
	setSessionReady: (directory: string, ready: boolean) => void
	setSessions: (directory: string, sessions: Session[]) => void
	setMessages: (directory: string, sessionID: string, messages: Message[]) => void
	setParts: (directory: string, messageID: string, parts: Part[]) => void

	// Hydration (server-side initial data)
	hydrateMessages: (
		directory: string,
		sessionID: string,
		messages: Message[],
		parts: Record<string, Part[]>,
	) => void

	// Session convenience methods
	getSession: (directory: string, id: string) => Session | undefined
	getSessions: (directory: string) => Session[]
	addSession: (directory: string, session: Session) => void
	updateSession: (directory: string, id: string, updater: (draft: Session) => void) => void
	removeSession: (directory: string, id: string) => void

	// Message convenience methods
	getMessages: (directory: string, sessionID: string) => Message[]
	addMessage: (directory: string, message: Message) => void
	updateMessage: (
		directory: string,
		sessionID: string,
		messageID: string,
		updater: (draft: Message) => void,
	) => void
	removeMessage: (directory: string, sessionID: string, messageID: string) => void
}

/**
 * Factory for empty DirectoryState
 */
const createEmptyDirectoryState = (): DirectoryState => ({
	ready: false,
	sessions: [],
	sessionStatus: {},
	sessionLastActivity: {},
	sessionDiff: {},
	todos: {},
	messages: {},
	parts: {},
})

/**
 * Zustand store with Immer middleware for immutable updates
 *
 * @example
 * const store = useOpencodeStore()
 * store.initDirectory("/my/project")
 * store.handleEvent("/my/project", { type: "session.updated", properties: { info: session } })
 */
export const useOpencodeStore = create<OpencodeState & OpencodeActions>()(
	immer((set, get) => ({
		// Initial state
		directories: {},

		// Initialize directory with empty state
		initDirectory: (directory) => {
			set((state) => {
				if (!state.directories[directory]) {
					state.directories[directory] = createEmptyDirectoryState()
				}
			})
		},

		// Central event dispatcher for SSE events
		handleEvent: (directory, event) => {
			set((state) => {
				// Auto-create directory if not exists
				if (!state.directories[directory]) {
					state.directories[directory] = createEmptyDirectoryState()
				}
				const dir = state.directories[directory]

				switch (event.type) {
					// ═══════════════════════════════════════════════════════════════
					// SESSION EVENTS
					// ═══════════════════════════════════════════════════════════════
					case "session.created":
					case "session.updated": {
						const session = event.properties.info as Session
						const result = Binary.search(dir.sessions, session.id, (s: Session) => s.id)

						// Handle archived sessions (remove them)
						if (session.time.archived) {
							if (result.found) {
								dir.sessions.splice(result.index, 1)
							}
							break
						}

						// Update or insert
						if (result.found) {
							dir.sessions[result.index] = session
						} else {
							dir.sessions.splice(result.index, 0, session)
						}
						break
					}

					case "session.status": {
						// Backend sends { type: "busy" | "retry" | "idle" } or SSE sends { running: boolean }
						const statusPayload = event.properties.status
						let status: SessionStatus = "completed"

						if (typeof statusPayload === "object" && statusPayload !== null) {
							if ("type" in statusPayload) {
								// Handle { type: "busy" | "retry" | "idle" } format from /session/status endpoint
								status =
									statusPayload.type === "busy" || statusPayload.type === "retry"
										? "running"
										: "completed"
							} else if ("running" in statusPayload) {
								// Handle { running: boolean } format from SSE
								status = statusPayload.running ? "running" : "completed"
							}
						} else if (typeof statusPayload === "string") {
							// Handle string format (for tests or future API changes)
							status = statusPayload as SessionStatus
						}

						dir.sessionStatus[event.properties.sessionID] = status
						// Track last activity time for sorting
						dir.sessionLastActivity[event.properties.sessionID] = Date.now()
						break
					}

					case "session.diff": {
						dir.sessionDiff[event.properties.sessionID] = event.properties.diff
						break
					}

					case "session.deleted": {
						const sessionID = event.properties.sessionID
						const result = Binary.search(dir.sessions, sessionID, (s: Session) => s.id)
						if (result.found) {
							dir.sessions.splice(result.index, 1)
						}
						break
					}

					// ═══════════════════════════════════════════════════════════════
					// MESSAGE EVENTS
					// ═══════════════════════════════════════════════════════════════
					case "message.updated": {
						const message = event.properties.info as Message
						const sessionID = message.sessionID

						// Initialize messages array if needed
						if (!dir.messages[sessionID]) {
							dir.messages[sessionID] = []
						}

						const messages = dir.messages[sessionID]
						const result = Binary.search(messages, message.id, (m: Message) => m.id)

						if (result.found) {
							messages[result.index] = message
						} else {
							messages.splice(result.index, 0, message)
						}
						break
					}

					case "message.removed": {
						const { sessionID, messageID } = event.properties
						const messages = dir.messages[sessionID]
						if (!messages) break

						const result = Binary.search(messages, messageID, (m: Message) => m.id)
						if (result.found) {
							messages.splice(result.index, 1)
						}
						break
					}

					// ═══════════════════════════════════════════════════════════════
					// PART EVENTS (streaming content)
					// ═══════════════════════════════════════════════════════════════
					case "message.part.updated": {
						const part = event.properties.part as Part
						const messageID = part.messageID

						// Initialize parts array if needed
						if (!dir.parts[messageID]) {
							dir.parts[messageID] = []
						}

						const parts = dir.parts[messageID]
						const result = Binary.search(parts, part.id, (p: Part) => p.id)

						if (result.found) {
							parts[result.index] = part
						} else {
							parts.splice(result.index, 0, part)
						}
						break
					}

					case "message.part.removed": {
						const { messageID, partID } = event.properties
						const parts = dir.parts[messageID]
						if (!parts) break

						const result = Binary.search(parts, partID, (p: Part) => p.id)
						if (result.found) {
							parts.splice(result.index, 1)
						}
						break
					}

					// ═══════════════════════════════════════════════════════════════
					// TODO EVENTS
					// ═══════════════════════════════════════════════════════════
					case "todo.updated": {
						dir.todos[event.properties.sessionID] = event.properties.todos
						break
					}

					// ═══════════════════════════════════════════════════════════
					// PROVIDER/PROJECT EVENTS (logged, not stored until state added)
					// ═══════════════════════════════════════════════════════════
					case "provider.updated": {
						// TODO: Update provider in state when DirectoryState has providers array
						console.log("[SSE] provider.updated:", event.properties)
						break
					}

					case "project.updated": {
						// TODO: Update project in state when DirectoryState has projects array
						console.log("[SSE] project.updated:", event.properties)
						break
					}
				}
			})
		},

		// Set directory ready flag
		setSessionReady: (directory, ready) => {
			set((state) => {
				if (state.directories[directory]) {
					state.directories[directory].ready = ready
				}
			})
		},

		// Set sessions array (sorted)
		setSessions: (directory, sessions) => {
			set((state) => {
				if (state.directories[directory]) {
					// Sort by ID for binary search
					state.directories[directory].sessions = sessions.sort((a, b) => a.id.localeCompare(b.id))
				}
			})
		},

		// Set messages array (sorted)
		setMessages: (directory, sessionID, messages) => {
			set((state) => {
				if (state.directories[directory]) {
					// Sort by ID for binary search
					state.directories[directory].messages[sessionID] = messages.sort((a, b) =>
						a.id.localeCompare(b.id),
					)
				}
			})
		},

		// Set parts array (sorted)
		setParts: (directory, messageID, parts) => {
			set((state) => {
				if (state.directories[directory]) {
					// Sort by ID for binary search
					state.directories[directory].parts[messageID] = parts.sort((a, b) =>
						a.id.localeCompare(b.id),
					)
				}
			})
		},

		/**
		 * Hydrate store with initial messages and parts from RSC
		 *
		 * This populates the store with server-rendered data before SSE connects,
		 * preventing the "blink" where tools appear first then text pops in later.
		 *
		 * Uses the same binary search insertion as SSE events, so duplicate events
		 * from SSE will be deduplicated (existing IDs are updated, not inserted).
		 *
		 * @param directory - Project directory path
		 * @param sessionID - Session ID to hydrate messages for
		 * @param messages - Array of messages to hydrate
		 * @param parts - Record of messageID -> Part[] to hydrate
		 *
		 * @example
		 * ```tsx
		 * // In RSC (page.tsx)
		 * const messages = await client.session.message.list({ sessionID })
		 * const parts = {} // Build parts from messages
		 *
		 * // In client component
		 * useEffect(() => {
		 *   store.hydrateMessages(directory, sessionID, messages, parts)
		 * }, [])
		 * ```
		 */
		hydrateMessages: (directory, sessionID, messages, parts) => {
			set((state) => {
				// Auto-create directory if not exists
				if (!state.directories[directory]) {
					state.directories[directory] = createEmptyDirectoryState()
				}
				const dir = state.directories[directory]

				// Filter out invalid messages (must have id) and sort
				const validMessages = messages.filter((m) => m && typeof m.id === "string")
				dir.messages[sessionID] = validMessages.sort((a, b) => a.id.localeCompare(b.id))

				// Hydrate parts for each message (sorted)
				for (const [messageID, messageParts] of Object.entries(parts)) {
					if (!messageID || !Array.isArray(messageParts)) continue
					const validParts = messageParts.filter((p) => p && typeof p.id === "string")
					dir.parts[messageID] = validParts.sort((a, b) => a.id.localeCompare(b.id))
				}
			})
		},

		// ═══════════════════════════════════════════════════════════════
		// SESSION CONVENIENCE METHODS
		// ═══════════════════════════════════════════════════════════════

		/**
		 * Get a single session by ID
		 */
		getSession: (directory, id) => {
			const dir = get().directories[directory]
			if (!dir) return undefined

			const result = Binary.search(dir.sessions, id, (s) => s.id)
			return result.found ? dir.sessions[result.index] : undefined
		},

		/**
		 * Get all sessions for a directory
		 */
		getSessions: (directory) => {
			return get().directories[directory]?.sessions || []
		},

		/**
		 * Add a session in sorted order
		 */
		addSession: (directory, session) => {
			set((state) => {
				// Auto-create directory if not exists
				if (!state.directories[directory]) {
					state.directories[directory] = createEmptyDirectoryState()
				}
				const dir = state.directories[directory]

				const result = Binary.search(dir.sessions, session.id, (s) => s.id)
				if (result.found) {
					// Session exists - replace it
					dir.sessions[result.index] = session
				} else {
					// Session doesn't exist - insert it
					dir.sessions.splice(result.index, 0, session)
				}
			})
		},

		/**
		 * Update a session using an updater function
		 */
		updateSession: (directory, id, updater) => {
			set((state) => {
				const dir = state.directories[directory]
				if (!dir) return

				const result = Binary.search(dir.sessions, id, (s) => s.id)
				if (result.found) {
					updater(dir.sessions[result.index])
				}
			})
		},

		/**
		 * Remove a session by ID
		 */
		removeSession: (directory, id) => {
			set((state) => {
				const dir = state.directories[directory]
				if (!dir) return

				const result = Binary.search(dir.sessions, id, (s) => s.id)
				if (result.found) {
					dir.sessions.splice(result.index, 1)
				}
			})
		},

		// ═══════════════════════════════════════════════════════════════
		// MESSAGE CONVENIENCE METHODS
		// ═══════════════════════════════════════════════════════════════

		/**
		 * Get all messages for a session
		 */
		getMessages: (directory, sessionID) => {
			return get().directories[directory]?.messages[sessionID] || []
		},

		/**
		 * Add a message in sorted order
		 */
		addMessage: (directory, message) => {
			set((state) => {
				// Auto-create directory if not exists
				if (!state.directories[directory]) {
					state.directories[directory] = createEmptyDirectoryState()
				}
				const dir = state.directories[directory]

				// Initialize messages array if needed
				if (!dir.messages[message.sessionID]) {
					dir.messages[message.sessionID] = []
				}

				const messages = dir.messages[message.sessionID]
				const result = Binary.search(messages, message.id, (m) => m.id)
				if (!result.found) {
					messages.splice(result.index, 0, message)
				}
			})
		},

		/**
		 * Update a message using an updater function
		 */
		updateMessage: (directory, sessionID, messageID, updater) => {
			set((state) => {
				const dir = state.directories[directory]
				if (!dir) return

				const messages = dir.messages[sessionID]
				if (!messages) return

				const result = Binary.search(messages, messageID, (m) => m.id)
				if (result.found) {
					updater(messages[result.index])
				}
			})
		},

		/**
		 * Remove a message by ID
		 */
		removeMessage: (directory, sessionID, messageID) => {
			set((state) => {
				const dir = state.directories[directory]
				if (!dir) return

				const messages = dir.messages[sessionID]
				if (!messages) return

				const result = Binary.search(messages, messageID, (m) => m.id)
				if (result.found) {
					messages.splice(result.index, 1)
				}
			})
		},

		// ═══════════════════════════════════════════════════════════════
		// SSE EVENT HANDLER (GlobalEvent wrapper)
		// ═══════════════════════════════════════════════════════════════

		/**
		 * Handle SSE GlobalEvent - wrapper for handleEvent
		 *
		 * This is the primary integration point for SSE events.
		 * SSEProvider calls this method when events arrive from the event stream.
		 * It extracts directory and payload from GlobalEvent and routes to handleEvent.
		 *
		 * @param event - GlobalEvent from SSE stream (contains directory and payload)
		 *
		 * @example Basic usage
		 * ```tsx
		 * const { subscribe } = useSSE()
		 *
		 * useEffect(() => {
		 *   const unsubscribe = subscribe("session.created", (globalEvent) => {
		 *     store.handleSSEEvent(globalEvent)
		 *   })
		 *   return unsubscribe
		 * }, [subscribe])
		 * ```
		 */
		handleSSEEvent: (event) => {
			// Auto-initialize directory if it doesn't exist
			// This ensures SSE events for any directory are processed, not dropped
			if (!get().directories[event.directory]) {
				set((state) => {
					state.directories[event.directory] = createEmptyDirectoryState()
				})
			}
			get().handleEvent(event.directory, event.payload)
		},
	})),
)

// ═══════════════════════════════════════════════════════════════
// MEMOIZED SELECTORS
// ═══════════════════════════════════════════════════════════════

/**
 * Memoized selector for part summary to avoid deep object traversal.
 * Returns undefined for non-tool parts or pending status.
 *
 * This function prevents unnecessary re-renders caused by Immer's new object references.
 * The selector extracts only the summary string, which allows Zustand's default equality
 * check (Object.is) to correctly identify when the value hasn't changed.
 *
 * For primitive values like strings, Object.is compares by value, so identical strings
 * are considered equal even if extracted from different part objects.
 *
 * @param directory - Project directory path
 * @param messageId - Message ID containing the part
 * @param partId - Part ID to get summary for
 * @returns Summary string or undefined
 *
 * @example
 * ```tsx
 * function TaskComponent({ messageId, partId }) {
 *   const summary = usePartSummary("/my/project", messageId, partId)
 *   return summary ? <div>{summary}</div> : null
 * }
 * ```
 */
export function usePartSummary(
	directory: string,
	messageId: string,
	partId: string,
): string | undefined {
	return useOpencodeStore((state) => {
		const parts = state.directories[directory]?.parts[messageId]
		if (!parts) return undefined

		// Use binary search instead of find() - parts are sorted by ID
		const result = Binary.search(parts, partId, (p: Part) => p.id)
		if (!result.found) return undefined

		const part = parts[result.index]
		if (part.type !== "tool") {
			return undefined
		}

		// Type assertion needed because Part has unknown fields
		const partState = part.state as { status: string; metadata?: { summary?: string } } | undefined
		if (!partState || partState.status === "pending") {
			return undefined
		}

		return partState.metadata?.summary
	})
}
