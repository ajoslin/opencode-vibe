/**
 * Route definitions for OpenCode
 * ADR 002 - Declarative route configuration with Effect-powered execution
 */
import * as Schema from "effect/Schema"
import { createOpencodeRoute } from "./builder.js"

/**
 * Message type from OpenCode API
 */
export interface Message {
	id: string
	sessionID: string
	role: string
	content?: string
	time?: { created: number; completed?: number }
	[key: string]: unknown
}

/**
 * Input schema for messages.list route
 * - sessionId: required string
 * - limit: optional positive number, defaults to 20
 */
const MessagesListInput = Schema.Struct({
	sessionId: Schema.String,
	limit: Schema.optionalWith(Schema.Number.pipe(Schema.positive()), {
		default: () => 20,
	}),
})

/**
 * Create route definitions
 * Returns a nested object of routes that can be passed to createRouter()
 */
export function createRoutes() {
	const o = createOpencodeRoute()

	return {
		messages: {
			/**
			 * List messages for a session with pagination
			 *
			 * @param sessionId - Session ID to fetch messages for
			 * @param limit - Maximum number of messages to return (default: 20)
			 * @returns Array of messages (newest first based on API behavior)
			 *
			 * @example
			 * ```ts
			 * // Initial load - last 20 messages
			 * const messages = await caller("messages.list", { sessionId: "ses_123" })
			 *
			 * // Load more for infinite scroll
			 * const moreMessages = await caller("messages.list", {
			 *   sessionId: "ses_123",
			 *   limit: 50
			 * })
			 * ```
			 */
			list: o({ timeout: "30s" })
				.input(MessagesListInput)
				.handler(async ({ input, sdk }) => {
					const response = await sdk.session.messages({
						path: { id: input.sessionId },
						query: { limit: input.limit },
					})
					return response.data ?? []
				}),
		},
	}
}

/**
 * Type for the routes object
 */
export type Routes = ReturnType<typeof createRoutes>
