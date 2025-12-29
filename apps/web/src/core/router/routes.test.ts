import { describe, it, expect, mock, beforeEach } from "bun:test"
import * as Effect from "effect/Effect"
import { createRouter } from "./router.js"
import { createCaller } from "./adapters/direct.js"
import { createRoutes } from "./routes.js"
import type { OpencodeClient } from "../client.js"

/**
 * TDD: Tests for route definitions
 * Focus on messages.list route with pagination support
 */

describe("routes", () => {
	describe("messages.list", () => {
		it("fetches messages for a session with default limit", async () => {
			const mockMessages = [
				{ id: "msg_1", sessionID: "ses_123", role: "user", content: "Hello" },
				{
					id: "msg_2",
					sessionID: "ses_123",
					role: "assistant",
					content: "Hi there",
				},
			]

			const mockSdk = {
				session: {
					messages: mock(async () => ({
						data: mockMessages,
					})),
				},
			} as unknown as OpencodeClient

			const routes = createRoutes()
			const router = createRouter(routes)
			const caller = createCaller(router, { sdk: mockSdk })

			const result = await caller<typeof mockMessages>("messages.list", {
				sessionId: "ses_123",
			})

			expect(result).toEqual(mockMessages)
			expect(mockSdk.session.messages).toHaveBeenCalledWith({
				path: { id: "ses_123" },
				query: { limit: 20 },
			})
		})

		it("fetches messages with custom limit", async () => {
			const mockMessages = Array.from({ length: 50 }, (_, i) => ({
				id: `msg_${i}`,
				sessionID: "ses_123",
				role: i % 2 === 0 ? "user" : "assistant",
				content: `Message ${i}`,
			}))

			const mockSdk = {
				session: {
					messages: mock(async () => ({
						data: mockMessages,
					})),
				},
			} as unknown as OpencodeClient

			const routes = createRoutes()
			const router = createRouter(routes)
			const caller = createCaller(router, { sdk: mockSdk })

			const result = await caller<typeof mockMessages>("messages.list", {
				sessionId: "ses_123",
				limit: 50,
			})

			expect(result).toEqual(mockMessages)
			expect(mockSdk.session.messages).toHaveBeenCalledWith({
				path: { id: "ses_123" },
				query: { limit: 50 },
			})
		})

		it("returns empty array when no messages exist", async () => {
			const mockSdk = {
				session: {
					messages: mock(async () => ({
						data: [],
					})),
				},
			} as unknown as OpencodeClient

			const routes = createRoutes()
			const router = createRouter(routes)
			const caller = createCaller(router, { sdk: mockSdk })

			const result = await caller<unknown[]>("messages.list", {
				sessionId: "ses_empty",
			})

			expect(result).toEqual([])
		})

		it("validates sessionId is required", async () => {
			const mockSdk = {
				session: {
					messages: mock(async () => ({ data: [] })),
				},
			} as unknown as OpencodeClient

			const routes = createRoutes()
			const router = createRouter(routes)
			const caller = createCaller(router, { sdk: mockSdk })

			// Should throw validation error when sessionId is missing
			await expect(caller("messages.list", {})).rejects.toThrow()
		})

		it("validates limit is a positive number", async () => {
			const mockSdk = {
				session: {
					messages: mock(async () => ({ data: [] })),
				},
			} as unknown as OpencodeClient

			const routes = createRoutes()
			const router = createRouter(routes)
			const caller = createCaller(router, { sdk: mockSdk })

			// Negative limit should fail validation
			await expect(caller("messages.list", { sessionId: "ses_123", limit: -1 })).rejects.toThrow()
		})

		it("has 30s timeout configured", async () => {
			const routes = createRoutes()
			const router = createRouter(routes)
			const route = router.resolve("messages.list")

			expect(route._config.timeout).toBe("30s")
		})
	})
})
