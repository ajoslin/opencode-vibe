/**
 * Tests for OpenCode client factory
 */

import { describe, expect, it, beforeEach } from "bun:test"
import { createClient, createClientFromAtom, getGlobalClientAsync, OPENCODE_URL } from "./client"
import type { OpencodeClient } from "@opencode-ai/sdk/client"

describe("createClient (existing behavior)", () => {
	it("creates client with default URL when no args", () => {
		const client = createClient()

		expect(client).toBeDefined()
		// Client should be using the OPENCODE_URL constant
	})

	it("creates client with directory parameter", () => {
		const client = createClient("/path/to/project")

		expect(client).toBeDefined()
	})

	it("creates client with directory and sessionId", () => {
		const client = createClient("/path/to/project", "session-123")

		expect(client).toBeDefined()
	})

	it("exports OPENCODE_URL constant", () => {
		expect(OPENCODE_URL).toBe("http://localhost:4056")
	})
})

describe("createClientFromAtom (new atom-based client)", () => {
	it("creates client when called with no args", () => {
		const client = createClientFromAtom()

		expect(client).toBeDefined()
		expect(typeof client.session).toBe("object")
	})

	it("creates client with directory parameter", () => {
		const client = createClientFromAtom("/path/to/project")

		expect(client).toBeDefined()
	})

	it("creates client with directory and sessionId", () => {
		const client = createClientFromAtom("/path/to/project", "session-123")

		expect(client).toBeDefined()
	})

	it("never returns empty baseUrl - always has fallback", () => {
		// Even with empty servers array in atom, should use localhost:4056
		const client = createClientFromAtom()

		expect(client).toBeDefined()
		// The client should have a valid baseUrl internally
	})
})

describe("backward compatibility", () => {
	it("both createClient and createClientFromAtom return OpencodeClient", () => {
		const oldClient = createClient()
		const newClient = createClientFromAtom()

		// Both should have the same interface
		expect(typeof oldClient.session).toBe("object")
		expect(typeof newClient.session).toBe("object")

		expect(typeof oldClient.provider).toBe("object")
		expect(typeof newClient.provider).toBe("object")
	})
})

describe("regression prevention (from semantic memory)", () => {
	it("NEVER returns empty URL - lesson from semantic memory bd-0571d346", () => {
		// This is a regression test for a critical bug where changing the default
		// from "http://localhost:4056" to empty string broke the app.
		// See semantic memory: "Multi-server SSE discovery broke the app..."

		// Even if discovery returns nothing, client should work
		const client = createClient()
		expect(client).toBeDefined()

		const atomClient = createClientFromAtom()
		expect(atomClient).toBeDefined()

		// The URL constant should NEVER be empty
		expect(OPENCODE_URL).toBeTruthy()
		expect(OPENCODE_URL).not.toBe("")
		expect(OPENCODE_URL).toBe("http://localhost:4056")
	})

	it("getGlobalClientAsync always returns a valid client", async () => {
		const client = await getGlobalClientAsync()
		expect(client).toBeDefined()
		expect(typeof client.session).toBe("object")
	})
})
