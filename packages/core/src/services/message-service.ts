/**
 * MessageService - Fetch messages with pre-joined parts
 *
 * Implements message-parts join logic to eliminate client-side joins.
 * Fetches messages and parts for a session, then joins parts to their
 * parent messages by messageID.
 *
 * This is pure data fetching with join computation, so uses 'sync' factory pattern.
 */

import { Effect } from "effect"
import { MessageAtom } from "../atoms/messages.js"
import { PartAtom } from "../atoms/parts.js"
import type { MessageWithParts } from "../types/messages.js"

/**
 * MessageService - Effect service for message-parts join operations
 *
 * Pure computation service that fetches data and performs joins.
 * Uses 'sync' factory pattern.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const service = yield* MessageService
 *   return service.listWithParts("ses-123", "/my/project")
 * })
 *
 * const messagesWithParts = await runWithRuntime(program)
 * ```
 */
export class MessageService extends Effect.Service<MessageService>()("MessageService", {
	effect: Effect.gen(function* () {
		return {
			/**
			 * Fetch messages with pre-joined parts
			 *
			 * Fetches messages and parts for a session, then joins parts to their
			 * parent messages by messageID. This eliminates the need for client-side
			 * joins in React components.
			 *
			 * @param sessionId - Session ID to fetch messages for
			 * @param directory - Project directory (optional)
			 * @returns Effect program that yields MessageWithParts[] or Error
			 *
			 * @example
			 * ```typescript
			 * const effect = Effect.gen(function* () {
			 *   const service = yield* MessageService
			 *   return service.listWithParts("ses-123")
			 * })
			 * const result = await runWithRuntime(effect)
			 * ```
			 */
			listWithParts: (
				sessionId: string,
				directory?: string,
			): Effect.Effect<MessageWithParts[], Error> =>
				Effect.gen(function* () {
					// Fetch messages and parts in parallel
					const [messages, parts] = yield* Effect.all(
						[MessageAtom.list(sessionId, directory), PartAtom.list(sessionId, directory)],
						{ concurrency: 2 },
					)

					// Join parts to messages by messageID
					const messagesWithParts: MessageWithParts[] = messages.map((message) => ({
						...message,
						parts: parts.filter((part) => part.messageID === message.id),
					}))

					return messagesWithParts
				}),
		}
	}),
}) {}
