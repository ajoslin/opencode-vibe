/**
 * ServerDiscovery Effect Service Tests
 *
 * TDD - Tests written first, then implementation.
 */

import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { ServerDiscovery, makeTestLayer, type ServerInfo } from "./discovery"

describe("ServerDiscovery", () => {
	test("discover() returns servers with url field added", async () => {
		// Mock API response
		const mockFetch = async () =>
			Response.json([
				{ port: 4056, pid: 12345, directory: "/Users/joel/Code/project1" },
				{ port: 4057, pid: 12346, directory: "/Users/joel/Code/project2" },
			])

		const program = Effect.gen(function* () {
			const discovery = yield* ServerDiscovery
			return yield* discovery.discover()
		})

		const testLayer = makeTestLayer(mockFetch as any)
		const result = await Effect.runPromise(program.pipe(Effect.provide(testLayer)))

		expect(result).toEqual([
			{
				port: 4056,
				directory: "/Users/joel/Code/project1",
				url: "http://localhost:4056",
			},
			{
				port: 4057,
				directory: "/Users/joel/Code/project2",
				url: "http://localhost:4057",
			},
		])
	})

	test("discover() returns empty array on fetch failure", async () => {
		// Mock fetch failure
		const mockFetch = async () => {
			throw new Error("Network error")
		}

		const program = Effect.gen(function* () {
			const discovery = yield* ServerDiscovery
			return yield* discovery.discover()
		})

		const testLayer = makeTestLayer(mockFetch as any)
		const result = await Effect.runPromise(program.pipe(Effect.provide(testLayer)))

		expect(result).toEqual([])
	})

	test("discover() returns empty array on non-ok response", async () => {
		// Mock 500 error
		const mockFetch = async () => new Response("Internal Server Error", { status: 500 })

		const program = Effect.gen(function* () {
			const discovery = yield* ServerDiscovery
			return yield* discovery.discover()
		})

		const testLayer = makeTestLayer(mockFetch as any)
		const result = await Effect.runPromise(program.pipe(Effect.provide(testLayer)))

		expect(result).toEqual([])
	})

	test("discover() returns empty array on invalid JSON", async () => {
		// Mock invalid JSON response
		const mockFetch = async () => new Response("not json", { status: 200 })

		const program = Effect.gen(function* () {
			const discovery = yield* ServerDiscovery
			return yield* discovery.discover()
		})

		const testLayer = makeTestLayer(mockFetch as any)
		const result = await Effect.runPromise(program.pipe(Effect.provide(testLayer)))

		expect(result).toEqual([])
	})

	test("discover() handles empty array response", async () => {
		// Mock empty array
		const mockFetch = async () => Response.json([])

		const program = Effect.gen(function* () {
			const discovery = yield* ServerDiscovery
			return yield* discovery.discover()
		})

		const testLayer = makeTestLayer(mockFetch as any)
		const result = await Effect.runPromise(program.pipe(Effect.provide(testLayer)))

		expect(result).toEqual([])
	})

	test("discover() calls correct endpoint", async () => {
		let calledUrl: string | undefined

		const mockFetch = async (input: RequestInfo | URL) => {
			calledUrl = input.toString()
			return Response.json([])
		}

		const program = Effect.gen(function* () {
			const discovery = yield* ServerDiscovery
			return yield* discovery.discover()
		})

		const testLayer = makeTestLayer(mockFetch as any)
		await Effect.runPromise(program.pipe(Effect.provide(testLayer)))

		expect(calledUrl).toBe("/api/opencode-servers")
	})

	test("discover() filters out servers with invalid data", async () => {
		// Mock response with invalid entries
		const mockFetch = async () =>
			Response.json([
				{ port: 4056, pid: 12345, directory: "/Users/joel/Code/project1" },
				{ port: "invalid", pid: 12346, directory: "/Users/joel/Code/project2" }, // Invalid port
				{ port: 4058, directory: "/Users/joel/Code/project3" }, // Missing pid (OK - we don't use it)
				{ port: 4059, pid: 12348 }, // Missing directory
			])

		const program = Effect.gen(function* () {
			const discovery = yield* ServerDiscovery
			return yield* discovery.discover()
		})

		const testLayer = makeTestLayer(mockFetch as any)
		const result = await Effect.runPromise(program.pipe(Effect.provide(testLayer)))

		expect(result).toEqual([
			{
				port: 4056,
				directory: "/Users/joel/Code/project1",
				url: "http://localhost:4056",
			},
			{
				port: 4058,
				directory: "/Users/joel/Code/project3",
				url: "http://localhost:4058",
			},
		])
	})
})
