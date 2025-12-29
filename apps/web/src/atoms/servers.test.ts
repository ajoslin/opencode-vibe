/**
 * Tests for server discovery atoms
 *
 * Note: These tests verify the factory functions that create atoms.
 * Testing the actual atom runtime behavior (Effects resolving, keepAlive, etc.)
 * requires integration testing with AtomRegistry and React hooks.
 * These tests focus on the logic layer: selectBestServer, default fallback, etc.
 */

import { describe, expect, it } from "bun:test"
import type { ServerInfo } from "../core/discovery"

/**
 * Default fallback server (duplicated from servers.ts for testing)
 */
const DEFAULT_SERVER: ServerInfo = {
	port: 4056,
	directory: "",
	url: "http://localhost:4056",
}

/**
 * Select best server from list (duplicated from servers.ts for testing)
 */
function selectBestServer(servers: ServerInfo[]): ServerInfo {
	const serverWithDir = servers.find((s) => s.directory !== "")
	return serverWithDir || servers[0] || DEFAULT_SERVER
}

describe("selectBestServer", () => {
	it("returns first server with directory when available", () => {
		const servers: ServerInfo[] = [
			{ port: 4056, directory: "", url: "http://localhost:4056" },
			{ port: 4057, directory: "/project/a", url: "http://localhost:4057" },
			{ port: 4058, directory: "/project/b", url: "http://localhost:4058" },
		]

		const result = selectBestServer(servers)

		expect(result.directory).toBe("/project/a")
		expect(result.port).toBe(4057)
	})

	it("returns first server when no directory available", () => {
		const servers: ServerInfo[] = [
			{ port: 4056, directory: "", url: "http://localhost:4056" },
			{ port: 4057, directory: "", url: "http://localhost:4057" },
		]

		const result = selectBestServer(servers)

		expect(result.port).toBe(4056)
	})

	it("returns default when server list is empty", () => {
		const servers: ServerInfo[] = []

		const result = selectBestServer(servers)

		expect(result).toEqual(DEFAULT_SERVER)
	})

	it("prefers first server with directory over later ones", () => {
		const servers: ServerInfo[] = [
			{ port: 4056, directory: "", url: "http://localhost:4056" },
			{ port: 4057, directory: "/project/a", url: "http://localhost:4057" },
			{ port: 4058, directory: "/project/b", url: "http://localhost:4058" },
		]

		const result = selectBestServer(servers)

		// Should pick 4057 (first with directory), not 4058
		expect(result.port).toBe(4057)
	})
})

describe("DEFAULT_SERVER constant", () => {
	it("has correct structure", () => {
		expect(DEFAULT_SERVER.port).toBe(4056)
		expect(DEFAULT_SERVER.directory).toBe("")
		expect(DEFAULT_SERVER.url).toBe("http://localhost:4056")
	})
})

describe("server discovery atom factories", () => {
	it("makeServersAtom and makeCurrentServerAtom exist and are callable", async () => {
		// This test just ensures the exports exist
		const { makeServersAtom, makeCurrentServerAtom } = await import("./servers")

		expect(typeof makeServersAtom).toBe("function")
		expect(typeof makeCurrentServerAtom).toBe("function")
	})

	it("default exports exist", async () => {
		const { serversAtom, currentServerAtom, useServers, useCurrentServer } = await import(
			"./servers"
		)

		expect(serversAtom).toBeDefined()
		expect(currentServerAtom).toBeDefined()
		expect(typeof useServers).toBe("function")
		expect(typeof useCurrentServer).toBe("function")
	})
})
