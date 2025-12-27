/**
 * useMessages - Hook for accessing messages with real-time updates
 *
 * Combines Zustand store with SSE subscriptions to provide reactive
 * message data. Subscribes to message.created, message.updated, and
 * message.part.updated events and automatically updates the store.
 *
 * @example
 * ```tsx
 * function SessionView({ sessionId }: { sessionId: string }) {
 *   const messages = useMessages(sessionId)
 *
 *   return <div>{messages.map(msg => <Message key={msg.id} {...msg} />)}</div>
 * }
 * ```
 */

import { useEffect } from "react"
import { useSSE } from "./use-sse"
import { useOpencodeStore, type Message } from "./store"

// Reusable empty array to avoid creating new references
const EMPTY_MESSAGES: Message[] = []

/**
 * useMessages - Get messages from store and subscribe to updates
 *
 * @param sessionId - ID of the session to retrieve messages for
 * @returns Array of messages for the session (empty if none exist)
 */
export function useMessages(sessionId: string): Message[] {
	const { subscribe } = useSSE()

	// Get messages from store (reactive - updates when store changes)
	// Return stable EMPTY_MESSAGES reference when no messages exist
	const messages = useOpencodeStore((state) => state.messages[sessionId] || EMPTY_MESSAGES)

	// Subscribe to SSE events for real-time updates
	useEffect(() => {
		// message.created - DEPRECATED: OpenCode API only emits message.updated
		// Keeping for backwards compatibility but message.updated handles both new and updated
		const unsubscribeCreated = subscribe("message.created", (event) => {
			// event.payload.properties.info contains Message data
			// sessionID is INSIDE info, not a separate property
			const props = event.payload?.properties as { info?: Message } | undefined
			const messageData = props?.info

			if (messageData?.sessionID === sessionId) {
				// Check if message already exists (dedupe)
				const store = useOpencodeStore.getState()
				const existingMessages = store.messages[sessionId] || []
				const exists = existingMessages.some((msg) => msg.id === messageData.id)

				if (!exists) {
					store.addMessage(messageData)
				}
			}
		})

		// message.updated - handles BOTH new and updated messages
		const unsubscribeUpdated = subscribe("message.updated", (event) => {
			// Payload: { properties: { info: Message } }
			// sessionID is INSIDE info, not a separate property
			const props = event.payload?.properties as { info?: Message } | undefined
			const messageData = props?.info

			if (messageData?.sessionID === sessionId) {
				// Update entire message with new data
				useOpencodeStore.getState().updateMessage(sessionId, messageData.id, (draft) => {
					Object.assign(draft, messageData)
				})
			}
		})

		// message.part.updated - tool calls, results, streaming chunks
		const unsubscribePartUpdated = subscribe("message.part.updated", (event) => {
			// Payload: { properties: { part: Part } }
			// Part has sessionID, messageID, and content
			type Part = {
				id: string
				sessionID: string
				messageID: string
				[key: string]: unknown
			}
			const props = event.payload?.properties as { part?: Part } | undefined
			const part = props?.part

			if (part?.sessionID === sessionId) {
				// Find the parent message and update its parts array
				const store = useOpencodeStore.getState()
				store.updateMessage(sessionId, part.messageID, (draft) => {
					// Type-cast parts array to work with unknown type
					type PartArray = Part[]
					const parts = (draft.parts as PartArray | undefined) || []

					// Find existing part or add new one
					const partIndex = parts.findIndex((p) => p.id === part.id)
					if (partIndex >= 0) {
						// Update existing part
						parts[partIndex] = part
					} else {
						// Add new part and sort by ID
						parts.push(part)
						parts.sort((a, b) => a.id.localeCompare(b.id))
					}

					// Assign back to draft
					draft.parts = parts as unknown
				})
			}
		})

		// Cleanup subscriptions
		return () => {
			unsubscribeCreated()
			unsubscribeUpdated()
			unsubscribePartUpdated()
		}
	}, [sessionId, subscribe])

	return messages
}
