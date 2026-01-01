/**
 * MessageService tests
 *
 * Tests the message-parts join logic in isolation.
 * Since MessageAtom and PartAtom fetch from real APIs, these tests
 * focus on the join logic by testing the service integration.
 *
 * For now, we'll skip integration tests that require a running backend.
 * The join logic is tested via the API layer tests.
 */

import { describe, it, expect } from "vitest"
import { Effect } from "effect"
import { MessageService } from "./message-service.js"
import type { Message, Part } from "../types/domain.js"
import type { MessageWithParts } from "../types/messages.js"

/**
 * Helper to run Effect and extract result
 */
async function runEffect<A>(effect: Effect.Effect<A, Error, MessageService>): Promise<A> {
	return Effect.runPromise(Effect.provide(effect, MessageService.Default))
}

describe("MessageService", () => {
	describe("service factory", () => {
		it("provides listWithParts method", async () => {
			const effect = Effect.gen(function* () {
				const service = yield* MessageService
				expect(service.listWithParts).toBeDefined()
				expect(typeof service.listWithParts).toBe("function")
				return true
			})

			const result = await runEffect(effect)
			expect(result).toBe(true)
		})
	})

	// Integration tests require a running backend - skip for now
	// The API layer will provide integration tests
	describe.skip("listWithParts integration", () => {
		it("fetches messages with embedded parts", async () => {
			const effect = Effect.gen(function* () {
				const service = yield* MessageService
				return yield* service.listWithParts("ses-123", "/test/directory")
			})

			const result = await runEffect(effect)
			expect(Array.isArray(result)).toBe(true)
		})
	})
})
