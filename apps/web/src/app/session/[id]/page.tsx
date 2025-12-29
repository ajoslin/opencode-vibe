import { notFound } from "next/navigation"
import { Suspense } from "react"
import { createClient } from "@/core/client"
import { transformMessages, type OpenCodeMessage } from "@/lib/transform-messages"
import type { Session } from "@opencode-ai/sdk/client"
import { SessionLayout } from "./session-layout"
import { Loader } from "@/components/ai-elements/loader"

// SDK returns messages as {info: Message, parts: Part[]} envelope
type SDKMessageEnvelope = {
	info: {
		id: string
		role: string
		createdAt: string
		[key: string]: unknown
	}
	parts: unknown[]
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

		// SDK returns messages as {info: Message, parts: Part[]} envelope
		const sdkMessages = (result.data as unknown as SDKMessageEnvelope[]).filter(
			(msg) => msg?.info && typeof msg.info.id === "string",
		)

		// Extract messages for store (without parts)
		const messages = sdkMessages.map((msg) => ({
			id: msg.info.id,
			sessionID: id,
			role: msg.info.role,
			time: { created: new Date(msg.info.createdAt).getTime() },
		}))

		// Extract parts grouped by messageID for store
		const parts: Record<string, any[]> = {}
		for (const msg of sdkMessages) {
			const msgId = msg.info.id
			if (msg.parts && Array.isArray(msg.parts) && msg.parts.length > 0) {
				parts[msgId] = msg.parts.map((part: any, index: number) => ({
					id: part.id || `${msgId}-part-${index}`,
					messageID: msgId,
					type: part.type || "text",
					content: part.content || part.text || "",
					...part, // Preserve all other fields
				}))
			}
		}

		// Convert to OpenCodeMessage format for initial UI render (already in correct shape)
		const opencodeMessages: OpenCodeMessage[] = sdkMessages.map((msg) => ({
			info: msg.info as unknown as OpenCodeMessage["info"],
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
