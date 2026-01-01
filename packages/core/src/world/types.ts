/**
 * World Stream Types - ADR-018 Reactive World Stream
 *
 * These types define the enriched world state that combines sessions, messages,
 * parts, and status into a reactive stream of the complete OpenCode state.
 */

import type { Message, Part, Session } from "../types/domain.js"
import type { SessionStatus } from "../types/events.js"

/**
 * Enriched session with status, messages, and computed properties
 */
export interface EnrichedSession extends Session {
	status: SessionStatus
	isActive: boolean
	messages: EnrichedMessage[]
	unreadCount: number
	contextUsagePercent: number
	lastActivityAt: number
}

/**
 * Enriched message with parts and streaming state
 */
export interface EnrichedMessage extends Message {
	parts: Part[]
	isStreaming: boolean
}

/**
 * Complete world state snapshot
 */
export interface WorldState {
	sessions: EnrichedSession[]
	activeSessionCount: number
	activeSession: EnrichedSession | null
	connectionStatus: "connecting" | "connected" | "disconnected" | "error"
	lastUpdated: number
}

/**
 * Configuration for world stream
 */
export interface WorldStreamConfig {
	/**
	 * Base URL for SSE connection
	 * @default "http://localhost:1999"
	 */
	baseUrl?: string

	/**
	 * Maximum number of sessions to load
	 * @default undefined (load all)
	 */
	maxSessions?: number

	/**
	 * Auto-reconnect on disconnect
	 * @default true
	 */
	autoReconnect?: boolean
}

/**
 * World stream handle for subscriptions
 */
export interface WorldStreamHandle {
	/**
	 * Subscribe to world state changes
	 * @returns Unsubscribe function
	 */
	subscribe(callback: (state: WorldState) => void): () => void

	/**
	 * Get current world state snapshot
	 */
	getSnapshot(): Promise<WorldState>

	/**
	 * Async iterator for world state changes
	 */
	[Symbol.asyncIterator](): AsyncIterableIterator<WorldState>

	/**
	 * Clean up resources
	 */
	dispose(): Promise<void>
}
