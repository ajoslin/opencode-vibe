/**
 * SSE Bridge
 *
 * Connects SSE events from MultiServerSSE to WorldStore mutations.
 * Maps event types to store updates for real-time state sync.
 *
 * ## Architecture
 *
 * ```
 * MultiServerSSE.onEvent() → SSEBridge.processEvent() → WorldStore.upsert*()
 * ```
 *
 * ## Event Mappings
 *
 * - `session.created`, `session.updated` → `store.upsertSession()`
 * - `message.updated` → `store.upsertMessage()`
 * - `message.part.updated` → `store.upsertPart()`
 * - `session.status` → `store.updateStatus()`
 *
 * ## Usage
 *
 * ```typescript
 * const store = new WorldStore()
 * const bridge = createSSEBridge(store)
 *
 * // Connect to SSE stream
 * multiServerSSE.onEvent((event) => {
 *   bridge.processEvent(event)
 * })
 * ```
 *
 * @example
 * ```typescript
 * // Process a session.created event
 * bridge.processEvent({
 *   directory: "/path/to/project",
 *   payload: {
 *     type: "session.created",
 *     properties: {
 *       info: { id: "session-1", title: "My Session", ... }
 *     }
 *   }
 * })
 * ```
 */

import type { WorldStore } from "./atoms.js"
import type { Session, Message, Part } from "../types/domain.js"
import type { SessionStatus } from "../types/events.js"

/**
 * SSE event structure from MultiServerSSE
 */
interface SSEEvent {
	directory: string
	payload: {
		type: string
		properties: Record<string, unknown>
	}
}

/**
 * SSE Bridge interface
 */
export interface SSEBridge {
	/**
	 * Process an SSE event and update the store
	 */
	processEvent(event: SSEEvent): void

	/**
	 * Disconnect and cleanup
	 */
	disconnect(): void
}

/**
 * Create an SSE bridge that connects events to a WorldStore
 *
 * @param store - WorldStore instance to update
 * @returns SSEBridge instance
 */
export function createSSEBridge(store: WorldStore): SSEBridge {
	return {
		processEvent(event: SSEEvent): void {
			const { type, properties } = event.payload

			switch (type) {
				case "session.created":
				case "session.updated": {
					const session = properties.info as Session | undefined
					if (session) {
						store.upsertSession(session)
					}
					break
				}

				case "message.updated": {
					const message = properties.info as Message | undefined
					if (message) {
						store.upsertMessage(message)
					}
					break
				}

				case "message.part.updated": {
					const part = properties.part as Part | undefined
					if (part) {
						store.upsertPart(part)
					}
					break
				}

				case "session.status": {
					const sessionID = properties.sessionID as string | undefined
					const status = properties.status as SessionStatus | undefined
					if (sessionID && status) {
						store.updateStatus(sessionID, status)
					}
					break
				}
			}
		},

		disconnect(): void {
			// No cleanup needed yet
			// Future: could unsubscribe from store notifications
		},
	}
}
