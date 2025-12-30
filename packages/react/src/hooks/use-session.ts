/**
 * useSession - Bridge Promise API to React state with SSE updates
 *
 * Wraps sessions.get from @opencode-vibe/core/api and manages React state.
 * Subscribes to SSE events for real-time updates when session is updated.
 *
 * @example
 * ```tsx
 * function SessionView({ sessionId }: { sessionId: string }) {
 *   const { session, loading, error, refetch } = useSession({ sessionId })
 *
 *   if (loading) return <div>Loading session...</div>
 *   if (error) return <div>Error: {error.message}</div>
 *   if (!session) return <div>Session not found</div>
 *
 *   return <div>{session.title}</div>
 * }
 * ```
 */

"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { sessions } from "@opencode-vibe/core/api"
import { multiServerSSE } from "@opencode-vibe/core/sse"
import type { Session } from "@opencode-vibe/core/types"

export interface UseSessionOptions {
	/** Session ID to fetch */
	sessionId: string
	/** Project directory (optional) */
	directory?: string
}

export interface UseSessionReturn {
	/** Session data or null if not found */
	session: Session | null
	/** Loading state */
	loading: boolean
	/** Error if fetch failed */
	error: Error | null
	/** Refetch session */
	refetch: () => void
}

/**
 * Hook to fetch a single session with real-time SSE updates
 *
 * @param options - Options with sessionId and optional directory
 * @returns Object with session, loading, error, and refetch
 */
export function useSession(options: UseSessionOptions): UseSessionReturn {
	const [session, setSession] = useState<Session | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<Error | null>(null)

	// Track sessionId in ref to avoid stale closures in SSE callback
	const sessionIdRef = useRef(options.sessionId)
	sessionIdRef.current = options.sessionId

	const fetch = useCallback(() => {
		setLoading(true)
		setError(null)

		sessions
			.get(options.sessionId, options.directory)
			.then((data: Session | null) => {
				setSession(data)
				setError(null)
			})
			.catch((err: unknown) => {
				const error = err instanceof Error ? err : new Error(String(err))
				setError(error)
				setSession(null)
			})
			.finally(() => {
				setLoading(false)
			})
	}, [options.sessionId, options.directory])

	// Initial fetch
	useEffect(() => {
		fetch()
	}, [fetch])

	// Subscribe to SSE events for real-time updates
	useEffect(() => {
		const unsubscribe = multiServerSSE.onEvent((event) => {
			const { type, properties } = event.payload

			// Handle session.created and session.updated events
			if (type !== "session.created" && type !== "session.updated") return

			const sessionData = properties.info as Session | undefined
			if (!sessionData) return
			if (sessionData.id !== sessionIdRef.current) return

			// Handle archived sessions (treat as deleted)
			if (sessionData.time?.archived) {
				setSession(null)
				return
			}

			setSession(sessionData)
		})

		return unsubscribe
	}, []) // Empty deps - callback uses refs

	return {
		session,
		loading,
		error,
		refetch: fetch,
	}
}
