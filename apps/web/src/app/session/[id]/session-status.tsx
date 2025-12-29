/**
 * SessionStatus - Visual indicator showing when AI is generating a response
 *
 * Shows "Running" when session.status.running === true, "Idle" otherwise.
 * Shows error message when session.error event fires.
 * Uses useSessionStatus hook to subscribe to SSE session.status events.
 *
 * @example
 * ```tsx
 * <SessionStatus sessionId="abc-123" />
 * ```
 */

"use client"

import { useState, useEffect } from "react"
import { useSessionStatus } from "@/react/use-session-status"
import { useSSE } from "@/react/use-sse"
import { Badge } from "@/components/ui/badge"
import type { GlobalEvent } from "@opencode-ai/sdk/client"

export interface SessionStatusProps {
	sessionId: string
}

/**
 * SessionStatus component - displays running/idle/error indicator
 */
export function SessionStatus({ sessionId }: SessionStatusProps) {
	const { running, isLoading } = useSessionStatus(sessionId)
	const [error, setError] = useState<string | null>(null)
	const { subscribe } = useSSE()

	// Subscribe to session events (error and status) and reset error on sessionId change
	useEffect(() => {
		// Reset error when sessionId changes
		setError(null)

		const unsubscribers = [
			subscribe("session.error", (event: GlobalEvent) => {
				const properties = (event.payload as any)?.properties

				// Ignore malformed events
				if (!properties) return

				// Filter by sessionID
				if (properties.sessionID !== sessionId) return

				// Extract error message
				const errorMessage = properties.error?.message
				if (errorMessage) {
					setError(errorMessage)
				}
			}),
			subscribe("session.status", (event: GlobalEvent) => {
				const properties = (event.payload as any)?.properties

				// Ignore malformed events
				if (!properties) return

				// Filter by sessionID
				if (properties.sessionID !== sessionId) return

				// Clear error when session starts running
				const status = properties.status
				if (status && typeof status.running === "boolean" && status.running) {
					setError(null)
				}
			}),
		]

		return () => {
			for (const unsubscribe of unsubscribers) {
				unsubscribe()
			}
		}
	}, [sessionId, subscribe])

	// Error state takes precedence
	if (error) {
		return <Badge variant="destructive">{error}</Badge>
	}

	if (isLoading) {
		return (
			<Badge variant="outline" className="animate-pulse">
				Loading...
			</Badge>
		)
	}

	return <Badge variant={running ? "default" : "secondary"}>{running ? "Running" : "Idle"}</Badge>
}
