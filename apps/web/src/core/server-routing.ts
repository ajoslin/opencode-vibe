/**
 * Server Routing Helpers
 *
 * Pure functions for determining which OpenCode server to route requests to.
 * Used by client.ts to pick the right server based on directory or session ID.
 *
 * Architecture:
 * - getServerForDirectory: Route based on project directory
 * - getServerForSession: Route based on session ID (with directory fallback)
 * - Always falls back to localhost:4056 (CRITICAL: never return empty string)
 *
 * @see {@link https://github.com/user/repo/blob/main/docs/server-discovery.md}
 */

const DEFAULT_SERVER_URL = "http://localhost:4056"

/**
 * Server information from discovery
 */
export interface ServerInfo {
	port: number
	directory: string
	url: string
}

/**
 * Normalize directory path by removing trailing slash
 */
function normalizeDirectory(directory: string): string {
	return directory.endsWith("/") ? directory.slice(0, -1) : directory
}

/**
 * Find server URL for a given directory.
 * Returns localhost:4056 if no match found (NEVER empty string).
 *
 * @param directory - Project directory path
 * @param servers - Available servers from discovery
 * @returns Server URL (always a valid URL, never empty)
 *
 * @example
 * ```ts
 * const url = getServerForDirectory("/home/user/project", servers)
 * // Returns "http://127.0.0.1:4057" if found, or "http://localhost:4056" if not
 * ```
 */
export function getServerForDirectory(directory: string, servers: ServerInfo[]): string {
	if (!directory || servers.length === 0) {
		return DEFAULT_SERVER_URL
	}

	const normalizedDirectory = normalizeDirectory(directory)

	// Find first server matching this directory
	const server = servers.find((s) => normalizeDirectory(s.directory) === normalizedDirectory)

	return server?.url ?? DEFAULT_SERVER_URL
}

/**
 * Find server URL for a session, with directory fallback.
 * Prefers session cache (if available), then directory match, then default.
 *
 * @param sessionId - Session ID to route
 * @param directory - Project directory (fallback if session not cached)
 * @param servers - Available servers from discovery
 * @param sessionToPort - Optional session->port cache from MultiServerSSE
 * @returns Server URL (always a valid URL, never empty)
 *
 * @example
 * ```ts
 * // With session cache
 * const url = getServerForSession("session-123", "/home/user/project", servers, cache)
 * // Returns cached server if found, else directory match, else default
 *
 * // Without session cache (falls back to directory)
 * const url = getServerForSession("session-123", "/home/user/project", servers)
 * ```
 */
export function getServerForSession(
	sessionId: string,
	directory: string,
	servers: ServerInfo[],
	sessionToPort?: Map<string, number>,
): string {
	if (servers.length === 0) {
		return DEFAULT_SERVER_URL
	}

	// 1. Check session cache first (most specific)
	if (sessionToPort) {
		const cachedPort = sessionToPort.get(sessionId)
		if (cachedPort !== undefined) {
			// Verify the cached port still exists in discovered servers
			const server = servers.find((s) => s.port === cachedPort)
			if (server) {
				return server.url
			}
			// Cached port is stale (server died) - fall through to directory match
		}
	}

	// 2. Fall back to directory match
	return getServerForDirectory(directory, servers)
}
