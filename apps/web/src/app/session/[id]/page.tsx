import { notFound } from "next/navigation"
import { Suspense } from "react"
import { createClient } from "@/core/client"
import { transformMessages, type OpenCodeMessage } from "@/lib/transform-messages"
import type { Session } from "@opencode-ai/sdk/client"
import { SessionLayout } from "./session-layout"
import { Loader } from "@/components/ai-elements/loader"

// SDK Message type is a union - we need the assistant/user message shape
type SDKMessage = {
	id: string
	role: string
	createdAt: string
	parts?: unknown[]
}

interface Props {
	params: Promise<{ id: string }>
	searchParams: Promise<{ dir?: string }>
}

/**
 * Fetch session data from the API (cached)
 */
async function getSession(id: string, directory?: string): Promise<Session | null> {
	"use cache"

	try {
		const client = createClient(directory)
		const result = await client.session.get({ path: { id } })
		return result.data || null
	} catch {
		return null
	}
}

/**
 * Fetch messages for a session (NOT cached - messages are real-time and can be very large)
 * SSE handles real-time updates after initial load
 *
 * Returns both transformed UIMessages for initial render AND raw messages/parts for store hydration
 */
async function getMessages(id: string, directory?: string) {
	try {
		const client = createClient(directory)
		const result = await client.session.messages({ path: { id } })

		if (!result.data) {
			return {
				uiMessages: [],
				messages: [],
				parts: {},
			}
		}

		// SDK returns messages with {id, role, createdAt, parts[]}
		const sdkMessages = (result.data as unknown as SDKMessage[]).filter(
			(msg) => msg && typeof msg.id === "string",
		)

		// Extract messages for store (without parts)
		const messages = sdkMessages.map((msg) => ({
			id: msg.id,
			sessionID: id,
			role: msg.role,
			time: { created: new Date(msg.createdAt).getTime() },
		}))

		// Extract parts grouped by messageID for store
		const parts: Record<string, any[]> = {}
		for (const msg of sdkMessages) {
			if (msg.parts && Array.isArray(msg.parts) && msg.parts.length > 0) {
				parts[msg.id] = msg.parts.map((part: any, index: number) => ({
					id: part.id || `${msg.id}-part-${index}`,
					messageID: msg.id,
					type: part.type || "text",
					content: part.content || part.text || "",
					...part, // Preserve all other fields
				}))
			}
		}

		// Convert to OpenCodeMessage format for initial UI render
		const opencodeMessages: OpenCodeMessage[] = sdkMessages.map((msg) => ({
			info: msg as unknown as OpenCodeMessage["info"],
			parts: (msg.parts || []) as OpenCodeMessage["parts"],
		}))

		return {
			uiMessages: transformMessages(opencodeMessages),
			messages,
			parts,
		}
	} catch {
		return {
			uiMessages: [],
			messages: [],
			parts: {},
		}
	}
}

/**
 * Session content - fetches session AND messages
 * All data fetching happens here inside Suspense
 */
async function SessionContent({
	paramsPromise,
	searchParamsPromise,
}: {
	paramsPromise: Promise<{ id: string }>
	searchParamsPromise: Promise<{ dir?: string }>
}) {
	// Await params inside Suspense boundary
	const { id: sessionId } = await paramsPromise
	const { dir: directory } = await searchParamsPromise

	// Fetch both in parallel
	const [session, messageData] = await Promise.all([
		getSession(sessionId, directory),
		getMessages(sessionId, directory),
	])

	// Handle not found inside the async component
	if (!session) {
		notFound()
	}

	return (
		<SessionLayout
			session={session}
			sessionId={sessionId}
			directory={directory}
			initialMessages={messageData.uiMessages}
			initialStoreMessages={messageData.messages}
			initialStoreParts={messageData.parts}
		/>
	)
}

/**
 * Loading fallback for session content
 */
function SessionLoading() {
	return (
		<div className="flex-1 flex items-center justify-center">
			<Loader />
		</div>
	)
}

/**
 * Session detail page - Server Component
 *
 * Passes params/searchParams promises to child component
 * so they can be awaited inside Suspense boundary.
 */
export default function SessionPage({ params, searchParams }: Props) {
	return (
		<div className="h-dvh flex flex-col bg-background">
			<div className="flex-1 flex flex-col min-h-0">
				<Suspense fallback={<SessionLoading />}>
					<SessionContent paramsPromise={params} searchParamsPromise={searchParams} />
				</Suspense>
			</div>
		</div>
	)
}
