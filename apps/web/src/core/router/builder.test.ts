/**
 * Tests for createOpencodeRoute() fluent API
 * TDD: RED phase - tests written first
 */
import { describe, it, expect } from "bun:test"
import { Schema } from "effect"
import { createOpencodeRoute } from "./builder.js"
import type { Route } from "./types.js"

describe("createOpencodeRoute", () => {
	it("returns a function that creates route builders", () => {
		const o = createOpencodeRoute()
		expect(typeof o).toBe("function")

		const builder = o({ timeout: "30s" })
		expect(builder).toBeDefined()
		expect(typeof builder.input).toBe("function")
		expect(typeof builder.timeout).toBe("function")
		expect(typeof builder.handler).toBe("function")
	})

	describe("RouteBuilder", () => {
		const o = createOpencodeRoute()

		it(".input() stores schema on route", () => {
			const schema = Schema.Struct({ id: Schema.String })
			const route = o()
				.input(schema)
				.handler(async () => ({ success: true })) as unknown as Route

			// Schema is stored (we can't check reference equality due to type coercion)
			expect(route._inputSchema).toBeDefined()
		})

		it(".timeout() sets timeout in config", () => {
			const route = o()
				.timeout("5s")
				.handler(async () => ({ success: true })) as unknown as Route

			expect(route._config.timeout).toBe("5s")
		})

		it(".retry() sets retry in config", () => {
			const route = o()
				.retry("exponential")
				.handler(async () => ({ success: true })) as unknown as Route

			expect(route._config.retry).toBe("exponential")
		})

		it(".concurrency() sets concurrency in config", () => {
			const route = o()
				.concurrency(10)
				.handler(async () => ({ success: true })) as unknown as Route

			expect(route._config.concurrency).toBe(10)
		})

		it(".stream() enables streaming in config", () => {
			const route = o()
				.stream()
				.handler(async () => ({ success: true })) as unknown as Route

			expect(route._config.stream).toBe(true)
		})

		it(".heartbeat() sets heartbeat in config", () => {
			const route = o()
				.heartbeat("10s")
				.handler(async () => ({ success: true })) as unknown as Route

			expect(route._config.heartbeat).toBe("10s")
		})

		it(".cache() sets cache config", () => {
			const cacheConfig = {
				ttl: "5m" as const,
				key: (input: unknown) => JSON.stringify(input),
			}
			const route = o()
				.cache(cacheConfig)
				.handler(async () => ({ success: true })) as unknown as Route

			expect(route._config.cache).toBe(cacheConfig)
		})

		it(".middleware() adds middleware to chain", () => {
			const mw1 = async (ctx: any, next: any) => next()
			const mw2 = async (ctx: any, next: any) => next()

			const route = o()
				.middleware(mw1)
				.middleware(mw2)
				.handler(async () => ({ success: true })) as unknown as Route

			expect(route._middleware).toHaveLength(2)
			expect(route._middleware[0]).toBe(mw1)
			expect(route._middleware[1]).toBe(mw2)
		})

		it(".onError() sets error handler", () => {
			const errorHandler = (error: unknown) => ({ error: "handled" })
			const route = o()
				.onError(errorHandler)
				.handler(async () => ({ success: true })) as unknown as Route

			expect(route._errorHandler).toBe(errorHandler)
		})

		it(".handler() returns Route with all config", () => {
			const schema = Schema.Struct({ id: Schema.String })
			const handlerFn = async () => ({ result: "success" })

			const route = o({ timeout: "30s" })
				.input(schema)
				.retry("exponential")
				.concurrency(5)
				.handler(handlerFn) as unknown as Route

			expect(route._config.timeout).toBe("30s")
			expect(route._config.retry).toBe("exponential")
			expect(route._config.concurrency).toBe(5)
			// Schema is stored (we can't check reference equality due to type coercion)
			expect(route._inputSchema).toBeDefined()
			expect(route._handler).toBe(handlerFn)
			expect(route._middleware).toEqual([])
		})

		it("config from createOpencodeRoute is merged with builder config", () => {
			const route = o({ timeout: "10s", retry: "linear" })
				.concurrency(3)
				.handler(async () => ({ success: true })) as unknown as Route

			expect(route._config.timeout).toBe("10s")
			expect(route._config.retry).toBe("linear")
			expect(route._config.concurrency).toBe(3)
		})

		it("builder config overrides initial config", () => {
			const route = o({ timeout: "10s" })
				.timeout("20s")
				.handler(async () => ({ success: true })) as unknown as Route

			expect(route._config.timeout).toBe("20s")
		})

		it("chaining methods returns same builder instance type", () => {
			const builder = o()
			const builder2 = builder.timeout("5s")
			const builder3 = builder2.retry("exponential")

			// Type checking - should compile
			expect(typeof builder2.timeout).toBe("function")
			expect(typeof builder3.timeout).toBe("function")
		})

		it("handles empty config", () => {
			const route = o().handler(async () => ({
				success: true,
			})) as unknown as Route

			expect(route._config).toEqual({})
			expect(route._middleware).toEqual([])
		})
	})
})
