/**
 * useSessionMessages - Hook for paginated message fetching with real-time updates
 *
 * Provides:
 * - Initial load with configurable limit (default 20)
 * - loadMore() for infinite scroll up
 * - hasMore flag to know if more messages exist
 * - loading state during fetches
 * - Integration with Zustand store for SSE updates
 *
 * @example
 * ```tsx
 * function MessageList({ sessionId }: { sessionId: string }) {
 *   const { messages, loadMore, hasMore, loading } = useSessionMessages({
 *     sessionId,
 *     directory: "/my/project",
 *     baseUrl: "http://localhost:4056",
 *   })
 *
 *   return (
 *     <div onScrollTop={() => hasMore && loadMore()}>
 *       {messages.map(msg => <Message key={msg.id} {...msg} />)}
 *       {loading && <Spinner />}
 *     </div>
 *   )
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef } from "react"
import { useOpencodeStore, type Message } from "./store"

/**
 * Options for useSessionMessages hook
 */
export interface UseSessionMessagesOptions {
	/** Session ID to fetch messages for */
	sessionId: string
	/** Project directory for store scoping */
	directory: string
	/** Base URL for API calls */
	baseUrl: string
	/** Initial number of messages to load (default: 20) */
	initialLimit?: number
	/** Number of additional messages to load on loadMore (default: 20) */
	loadMoreIncrement?: number
}

/**
 * Return type for useSessionMessages hook
 */
export interface UseSessionMessagesResult {
	/** Array of messages (reactive, updates from SSE) */
	messages: Message[]
	/** Load more messages (for infinite scroll up) */
	loadMore: () => Promise<void>
	/** Whether more messages might exist */
	hasMore: boolean
	/** Whether a fetch is in progress */
	loading: boolean
	/** Error from last fetch, if any */
	error: Error | null
}

/**
 * Empty messages constant to avoid re-rendering when no messages exist
 */
const EMPTY_MESSAGES: Message[] = []

/**
 * Hook for paginated message fetching with real-time SSE updates
 */
export function useSessionMessages(options: UseSessionMessagesOptions): UseSessionMessagesResult {
	const { sessionId, directory, baseUrl, initialLimit = 20, loadMoreIncrement = 20 } = options

	// Local state for pagination
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<Error | null>(null)
	const [hasMore, setHasMore] = useState(true)
	const [currentLimit, setCurrentLimit] = useState(initialLimit)

	// Track if we're currently fetching to prevent duplicate requests
	const fetchingRef = useRef(false)

	// Get messages from store (reactive - updates when SSE events arrive)
	const storeMessages = useOpencodeStore(
		(state) => state.directories[directory]?.messages[sessionId] || EMPTY_MESSAGES,
	)

	// Fetch messages from API
	const fetchMessages = useCallback(
		async (limit: number) => {
			if (fetchingRef.current) return

			fetchingRef.current = true
			setLoading(true)
			setError(null)

			try {
				const url = `${baseUrl}/session/${sessionId}/message?limit=${limit}`
				const response = await fetch(url, {
					headers: {
						"x-opencode-directory": directory,
					},
				})

				if (!response.ok) {
					throw new Error(`Failed to fetch messages: ${response.status} ${response.statusText}`)
				}

				const messages = await response.json()

				// Update store with fetched messages
				useOpencodeStore.getState().setMessages(directory, sessionId, messages)

				// Determine if there might be more messages
				// If we got fewer than requested, there are no more
				setHasMore(messages.length >= limit)
				setCurrentLimit(limit)
			} catch (err) {
				setError(err instanceof Error ? err : new Error(String(err)))
			} finally {
				setLoading(false)
				fetchingRef.current = false
			}
		},
		[baseUrl, sessionId, directory],
	)

	// Initial fetch
	useEffect(() => {
		fetchMessages(initialLimit)
	}, [fetchMessages, initialLimit])

	// Load more messages (for infinite scroll)
	const loadMore = useCallback(async () => {
		if (loading || !hasMore) return

		const newLimit = currentLimit + loadMoreIncrement
		await fetchMessages(newLimit)
	}, [loading, hasMore, currentLimit, loadMoreIncrement, fetchMessages])

	return {
		messages: storeMessages,
		loadMore,
		hasMore,
		loading,
		error,
	}
}
