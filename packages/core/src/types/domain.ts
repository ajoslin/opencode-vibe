/**
 * Domain types for OpenCode entities
 *
 * These types match the OpenCode API response shapes.
 */

/**
 * Session type
 */
export type Session = {
	id: string
	title: string
	directory: string
	parentID?: string
	time: {
		created: number
		updated: number
		archived?: number
	}
}

/**
 * Message type matching OpenCode API
 */
export type Message = {
	id: string
	sessionID: string
	role: string
	parentID?: string // Assistant messages have parentID pointing to user message
	time?: { created: number; completed?: number }
	finish?: string // "stop", "tool-calls", etc. - only set when complete
	tokens?: {
		input: number
		output: number
		reasoning?: number
		cache?: {
			read: number
			write: number
		}
	}
	agent?: string // Agent name (e.g., "compaction")
	model?: {
		name: string
		limits?: {
			context: number
			output: number
		}
	}
	[key: string]: unknown // Allow additional fields
}

/**
 * Part type for streaming message content
 *
 * TODO: Replace with SDK types from @opencode-ai/sdk (see cell opencode-next--xts0a-mjx932w6bvg)
 */
export type Part = {
	id: string
	sessionID: string // All parts have sessionID from the backend
	messageID: string
	type: string
	content?: string
	text?: string // TextPart uses text, not content
	tool?: string
	state?: {
		status?: string
		[key: string]: unknown
	}
	time?: {
		start: number
		end?: number
	}
	[key: string]: unknown // Allow additional fields
}

/**
 * Session with computed status
 * Used for rendering session lists with real-time status
 */
export interface SessionWithStatus {
	session: Session
	status: "pending" | "running" | "completed" | "error"
}
