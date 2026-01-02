/**
 * WorldState - Aggregated view of OpenCode servers
 *
 * Builds a coherent world view from SSE events across multiple servers.
 * Tracks sessions, their status, message activity, and streaming state.
 */

/**
 * Session status derived from events
 */
export type SessionStatus = "active" | "idle" | "completed" | "unknown"

/**
 * A session with enriched state
 */
export interface EnrichedSession {
	id: string
	projectKey: string
	status: SessionStatus
	messageCount: number
	lastActivityAt: number
	isStreaming: boolean
}

/**
 * Project aggregation - sessions grouped by directory
 */
export interface ProjectState {
	directory: string
	sessions: EnrichedSession[]
	activeCount: number
	totalMessages: number
	lastActivityAt: number
}

/**
 * Complete world state snapshot
 */
export interface WorldState {
	projects: ProjectState[]
	totalSessions: number
	activeSessions: number
	streamingSessions: number
	lastEventOffset: string
	lastUpdated: number
}

/**
 * Format WorldState for pretty output
 */
export function formatWorldState(state: WorldState): string {
	const lines: string[] = []

	lines.push("╔═══════════════════════════════════════════════════════════╗")
	lines.push("║                    🌍 WORLD STATE 🌍                      ║")
	lines.push("╠═══════════════════════════════════════════════════════════╣")
	lines.push(
		`║  Sessions: ${state.totalSessions.toString().padEnd(6)} Active: ${state.activeSessions.toString().padEnd(6)} Streaming: ${state.streamingSessions.toString().padEnd(4)} ║`,
	)
	lines.push("╠═══════════════════════════════════════════════════════════╣")

	if (state.projects.length === 0) {
		lines.push("║  No sessions found                                        ║")
	}

	for (const project of state.projects) {
		const shortDir = project.directory.replace(/^\/Users\/[^/]+/, "~")
		lines.push(`║  📁 ${shortDir.padEnd(52)} ║`)

		const activeIcon = project.activeCount > 0 ? "🟢" : "⚪"
		lines.push(
			`║     ${activeIcon} ${project.sessions.length} sessions, ${project.activeCount} active, ${project.totalMessages} msgs`.padEnd(
				58,
			) + " ║",
		)

		// Show top 3 most recent sessions
		const recentSessions = project.sessions.slice(0, 3)
		for (const session of recentSessions) {
			const statusIcon = session.isStreaming ? "⚡" : session.status === "active" ? "🔵" : "⚫"
			const shortId = session.id.slice(-8)
			const ago = formatTimeAgo(session.lastActivityAt)
			lines.push(
				`║       ${statusIcon} ${shortId} (${session.messageCount} msgs, ${ago})`.padEnd(58) + " ║",
			)
		}

		if (project.sessions.length > 3) {
			lines.push(`║       ... and ${project.sessions.length - 3} more`.padEnd(58) + " ║")
		}
	}

	lines.push("╠═══════════════════════════════════════════════════════════╣")
	const offset = state.lastEventOffset || "0"
	lines.push(`║  Offset: ${offset.padEnd(48)} ║`)
	lines.push("╚═══════════════════════════════════════════════════════════╝")

	return lines.join("\n")
}

/**
 * Format timestamp as relative time
 */
function formatTimeAgo(timestamp: number): string {
	const now = Date.now()
	const diff = now - timestamp

	if (diff < 1000) return "now"
	if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
	if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
	if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
	return `${Math.floor(diff / 86400000)}d ago`
}

/**
 * Convert core WorldState (session-centric) to CLI WorldState (project-grouped)
 *
 * The @opencode-vibe/core/world WorldStore returns session-centric state.
 * The CLI needs project-grouped state for directory-based organization.
 * This adapter bridges the gap.
 *
 * Note: Core Session uses `directory`, CLI uses `projectKey` (they're the same thing)
 */
export function adaptCoreWorldState(
	coreState: import("@opencode-vibe/core/world").WorldState,
): WorldState {
	// Group sessions by directory (called projectKey in CLI)
	// Use local EnrichedSession type, not core's
	const projectMap = new Map<string, EnrichedSession[]>()

	for (const coreSession of coreState.sessions) {
		// Map core EnrichedSession to CLI EnrichedSession
		const cliSession: EnrichedSession = {
			id: coreSession.id,
			projectKey: coreSession.directory, // Core uses 'directory', CLI uses 'projectKey'
			status: mapCoreStatusToCliStatus(coreSession.status),
			messageCount: coreSession.messages.length,
			lastActivityAt: coreSession.lastActivityAt,
			isStreaming: coreSession.messages.some((m) => m.isStreaming),
		}

		const existing = projectMap.get(coreSession.directory) || []
		existing.push(cliSession)
		projectMap.set(coreSession.directory, existing)
	}

	// Build project states
	const projects: ProjectState[] = []
	for (const [directory, sessions] of projectMap) {
		// Sort sessions by last activity (most recent first)
		sessions.sort((a, b) => b.lastActivityAt - a.lastActivityAt)

		projects.push({
			directory,
			sessions,
			activeCount: sessions.filter((s) => s.status === "active").length,
			totalMessages: sessions.reduce((sum, s) => sum + s.messageCount, 0),
			lastActivityAt: Math.max(...sessions.map((s) => s.lastActivityAt)),
		})
	}

	// Sort projects by last activity
	projects.sort((a, b) => b.lastActivityAt - a.lastActivityAt)

	// Calculate totals
	const activeSessions = coreState.sessions.filter((s) => s.isActive).length
	const streamingSessions = coreState.sessions.filter((s) =>
		s.messages.some((m) => m.isStreaming),
	).length

	return {
		projects,
		totalSessions: coreState.sessions.length,
		activeSessions,
		streamingSessions,
		lastEventOffset: "0", // Not tracked in core WorldState
		lastUpdated: coreState.lastUpdated,
	}
}

/**
 * Map core SessionStatus to CLI SessionStatus
 */
function mapCoreStatusToCliStatus(
	coreStatus: import("@opencode-vibe/core/world").EnrichedSession["status"],
): SessionStatus {
	switch (coreStatus) {
		case "running":
			return "active"
		case "completed":
			return "completed"
		default:
			return "idle"
	}
}
