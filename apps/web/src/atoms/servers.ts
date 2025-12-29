/**
 * Server Discovery Atoms
 *
 * Reactive state management for OpenCode server discovery using effect-atom.
 * Provides atoms for server list and current server selection with:
 * - Effect-native server discovery integration
 * - Automatic fallback to localhost:4056
 * - 5s refresh interval
 * - Persistent state (keepAlive)
 * - React hooks for easy consumption
 *
 * @module atoms/servers
 */

import { Atom } from "@effect-atom/atom"
import { useAtomValue } from "@effect-atom/atom-react"
import type { Result } from "@effect-atom/atom/Result"
import { Effect, Layer, Stream, Schedule } from "effect"
import { ServerDiscovery, type ServerInfo, Default } from "../core/discovery"

/**
 * Default fallback server (localhost:4056)
 * CRITICAL: This must ALWAYS be available as fallback
 */
const DEFAULT_SERVER: ServerInfo = {
	port: 4056,
	directory: "",
	url: "http://localhost:4056",
}

/**
 * Factory function to create serversAtom with injectable Layer (for testing)
 *
 * @param layer - Effect Layer providing ServerDiscovery service
 * @returns Atom containing Effect that resolves to server list
 */
export function makeServersAtom(layer: Layer.Layer<typeof ServerDiscovery.Service>) {
	const runtime = Atom.runtime(layer)

	// Effect that discovers servers and ensures default is included
	const discoverServers = Effect.gen(function* () {
		const discovery = yield* ServerDiscovery
		const servers = yield* discovery.discover()

		// CRITICAL: Always include localhost:4056 default
		// If discovery returned empty, use default
		// If discovery returned servers, ensure default is in the list
		if (servers.length === 0) {
			return [DEFAULT_SERVER]
		}

		// Check if default server already in list
		const hasDefault = servers.some(
			(s) => s.port === DEFAULT_SERVER.port && s.directory === DEFAULT_SERVER.directory,
		)

		// If default not found, prepend it
		return hasDefault ? servers : [DEFAULT_SERVER, ...servers]
	})

	// Create a stream that polls every 5 seconds
	const discoveryStream = Stream.fromEffect(discoverServers).pipe(
		Stream.repeat(Schedule.spaced("5 seconds")),
	)

	const atom = runtime.atom(discoveryStream, {
		initialValue: [DEFAULT_SERVER],
	})

	return Atom.keepAlive(atom)
}

/**
 * Servers atom - reactive list of discovered OpenCode servers
 * Returns Result<ServerInfo[]> (Loading | Success | Failure)
 * Always includes localhost:4056 as fallback
 */
export const serversAtom = makeServersAtom(Default)

/**
 * Factory function to create currentServerAtom with injectable serversAtom (for testing)
 *
 * @param sourceAtom - The serversAtom to derive from
 * @returns Atom containing current server (derived from Result)
 */
export function makeCurrentServerAtom(sourceAtom: ReturnType<typeof makeServersAtom>) {
	return Atom.map(sourceAtom, (serversResult: Result<ServerInfo[], never>) => {
		// Handle Result type from effectful atom
		if (serversResult._tag === "Success") {
			return serversResult.value.length > 0 ? selectBestServer(serversResult.value) : DEFAULT_SERVER
		}
		// Return default for Loading or Failure
		return DEFAULT_SERVER
	})
}

/**
 * Current server atom - derived from serversAtom
 * Selects "best" server using heuristic:
 * 1. First server with non-empty directory (active project)
 * 2. Otherwise, first server in list
 * Returns Result<ServerInfo> (Loading | Success | Failure)
 */
export const currentServerAtom = makeCurrentServerAtom(serversAtom)

/**
 * Select best server from list
 * Preference: first server with directory, otherwise first server
 *
 * @param servers - List of available servers
 * @returns The selected server
 */
function selectBestServer(servers: ServerInfo[]): ServerInfo {
	// Prefer first server with a directory
	const serverWithDir = servers.find((s) => s.directory !== "")
	return serverWithDir || servers[0] || DEFAULT_SERVER
}

/**
 * React hook to access server list
 * Returns Result<ServerInfo[]>
 *
 * @example
 * ```tsx
 * const serversResult = useServers()
 * if (serversResult._tag === "Success") {
 *   console.log(serversResult.value)
 * }
 * ```
 */
export function useServers() {
	return useAtomValue(serversAtom)
}

/**
 * React hook to access current server
 * Returns Result<ServerInfo>
 *
 * @example
 * ```tsx
 * const currentResult = useCurrentServer()
 * if (currentResult._tag === "Success") {
 *   console.log(currentResult.value.url)
 * }
 * ```
 */
export function useCurrentServer() {
	return useAtomValue(currentServerAtom)
}
