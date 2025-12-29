/**
 * useMultiServerSSE - Subscribe to SSE events from all OpenCode servers
 *
 * Discovers all running opencode servers on the local machine and subscribes
 * to ALL their events (messages, parts, status, etc.). Updates the Zustand store.
 *
 * This enables real-time updates from TUIs and other opencode processes!
 * When you send a message to a session running in a TUI, you'll see the
 * response stream in real-time in the web UI.
 *
 * @example
 * ```tsx
 * function ProjectsList() {
 *   useMultiServerSSE()
 *   // Store is automatically updated with events from ALL servers
 *   return <div>Projects</div>
 * }
 * ```
 */

import { useEffect } from "react"
import { multiServerSSE } from "@/core/multi-server-sse"
import { useOpencodeStore } from "./store"

/**
 * Helper to get store actions without causing re-renders.
 * Zustand's getState() returns stable action references.
 */
const getStoreActions = () => useOpencodeStore.getState()

/**
 * Hook to subscribe to multi-server SSE events
 *
 * Lifecycle:
 * 1. On mount: start multi-server discovery (singleton - only starts once)
 * 2. Subscribe to ALL events from all discovered servers
 * 3. Forward events to store (messages, parts, status, etc.)
 * 4. On unmount: unsubscribe (but don't stop the singleton - other components may need it)
 */
export function useMultiServerSSE() {
	useEffect(() => {
		// Start multi-server discovery and SSE (idempotent - only starts once)
		multiServerSSE.start()

		// Subscribe to ALL events from all servers (not just status)
		// This enables message/part updates from TUIs!
		const unsubscribe = multiServerSSE.onEvent((event) => {
			const store = getStoreActions()

			// Initialize directory if needed
			store.initDirectory(event.directory)

			// Forward event to store - handles all event types
			store.handleEvent(event.directory, event.payload)
		})

		// Only unsubscribe, don't stop the singleton
		// It stays running for the lifetime of the app
		return unsubscribe
	}, []) // Empty deps - only run once on mount
}
