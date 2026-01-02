/**
 * Derived World Atom - ADR-018 Reactive World Stream
 *
 * Creates enriched world state by deriving from base atoms.
 * Uses effect-atom's Atom.make((get) => ...) for automatic dependency tracking.
 *
 * This is the TDD migration from WorldStore.deriveWorldState to effect-atom.
 */

import { Atom } from "@effect-atom/atom"
import type { Message, Part, Session } from "../types/domain.js"
import type { SessionStatus } from "../types/events.js"
import type { EnrichedMessage, EnrichedSession, WorldState } from "./types.js"

/**
 * Array-based atoms for enrichment logic
 *
 * These use arrays for simpler iteration during enrichment.
 * The Map-based atoms in atoms.ts are for O(1) SSE updates.
 *
 * TODO: Reconcile these two approaches - either:
 * 1. Convert Map atoms to arrays in worldAtom derivation
 * 2. Use a single atom design throughout
 */
export const sessionsAtom = Atom.make<Session[]>([])
export const messagesAtom = Atom.make<Message[]>([])
export const partsAtom = Atom.make<Part[]>([])
export const statusAtom = Atom.make<Record<string, SessionStatus>>({})
export const connectionStatusAtom = Atom.make<
	"connecting" | "connected" | "disconnected" | "error"
>("disconnected")

/**
 * Derived world atom with enrichment logic
 *
 * Automatically recomputes when any base atom changes.
 * Implements the same enrichment logic as WorldStore.deriveWorldState.
 */
export const worldAtom = Atom.make((get) => {
	const sessions = get(sessionsAtom)
	const messages = get(messagesAtom)
	const parts = get(partsAtom)
	const status = get(statusAtom)
	const connectionStatus = get(connectionStatusAtom)

	// Build message ID -> parts map
	const partsByMessage = new Map<string, Part[]>()
	for (const part of parts) {
		const existing = partsByMessage.get(part.messageID) ?? []
		existing.push(part)
		partsByMessage.set(part.messageID, existing)
	}

	// Build session ID -> enriched messages map
	const messagesBySession = new Map<string, EnrichedMessage[]>()
	for (const msg of messages) {
		const msgParts = partsByMessage.get(msg.id) ?? []
		const enrichedMsg: EnrichedMessage = {
			...msg,
			parts: msgParts,
			// Message is streaming if it's assistant role and has no completed time
			isStreaming: msg.role === "assistant" && !msg.time?.completed,
		}

		const existing = messagesBySession.get(msg.sessionID) ?? []
		existing.push(enrichedMsg)
		messagesBySession.set(msg.sessionID, existing)
	}

	// Build enriched sessions
	const enrichedSessions: EnrichedSession[] = sessions.map((session) => {
		const sessionMessages = messagesBySession.get(session.id) ?? []
		const sessionStatus = status[session.id] ?? "completed"
		const isActive = sessionStatus === "running"

		// Last activity is most recent message or session update
		const lastMessageTime =
			sessionMessages.length > 0 ? Math.max(...sessionMessages.map((m) => m.time?.created ?? 0)) : 0
		const lastActivityAt = Math.max(lastMessageTime, session.time.updated)

		// Context usage percent - compute from last assistant message tokens
		// Total tokens = input + output + reasoning + cache.read + cache.write
		let contextUsagePercent = 0
		for (let i = sessionMessages.length - 1; i >= 0; i--) {
			const msg = sessionMessages[i]
			if (msg.role === "assistant" && msg.tokens && msg.model?.limits?.context) {
				const totalTokens =
					msg.tokens.input +
					msg.tokens.output +
					(msg.tokens.reasoning ?? 0) +
					(msg.tokens.cache?.read ?? 0) +
					(msg.tokens.cache?.write ?? 0)
				contextUsagePercent = (totalTokens / msg.model.limits.context) * 100
				break
			}
		}

		return {
			...session,
			status: sessionStatus,
			isActive,
			messages: sessionMessages,
			unreadCount: 0, // TODO: implement unread tracking
			contextUsagePercent,
			lastActivityAt,
		}
	})

	// Sort sessions by last activity (most recent first)
	enrichedSessions.sort((a, b) => b.lastActivityAt - a.lastActivityAt)

	// Active session is the most recently active one
	const activeSession = enrichedSessions.find((s) => s.isActive) ?? enrichedSessions[0] ?? null
	const activeSessionCount = enrichedSessions.filter((s) => s.isActive).length

	const worldState: WorldState = {
		sessions: enrichedSessions,
		activeSessionCount,
		activeSession,
		connectionStatus,
		lastUpdated: Date.now(),
	}

	return worldState
})
