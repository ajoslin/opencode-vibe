"use client"

import { Fragment, useEffect, useState, useRef, useCallback } from "react"
import type { UIMessage, ChatStatus } from "ai"
import { useSSE } from "@/react"
import { createClient } from "@/core/client"
import { transformMessages, type OpenCodeMessage } from "@/lib/transform-messages"
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message"
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from "@/components/ai-elements/tool"
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning"
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
	ConversationEmptyState,
} from "@/components/ai-elements/conversation"
import {
	PromptInput,
	PromptInputBody,
	PromptInputTextarea,
	PromptInputFooter,
	PromptInputSubmit,
	type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"
import { Loader } from "@/components/ai-elements/loader"

/**
 * SSE event payload shapes (from OpenCode API)
 * - message.updated → { properties: { info: Message } }
 * - message.part.updated → { properties: { part: Part } }
 * - session.status → { properties: { sessionID: string, status: { running: boolean } } }
 */
type MessageInfo = {
	id: string
	sessionID: string
	role: string
	createdAt?: string
	time?: { created: number; completed?: number }
}

type PartInfo = {
	id: string
	sessionID: string
	messageID: string
	type: string
	text?: string
	[key: string]: unknown
}

interface SessionMessagesProps {
	sessionId: string
	directory?: string
	initialMessages: UIMessage[]
	onMessagesChange?: (messages: OpenCodeMessage[]) => void
}

/**
 * Client component for session messages with real-time SSE updates.
 * Handles race conditions where parts may arrive before their parent message.
 */
export function SessionMessages({ sessionId, directory, initialMessages }: SessionMessagesProps) {
	const [_rawMessages, setRawMessages] = useState<OpenCodeMessage[]>([])
	const [messages, setMessages] = useState<UIMessage[]>(initialMessages)
	const [input, setInput] = useState("")
	const [status, setStatus] = useState<ChatStatus>("ready")
	const { subscribe } = useSSE()

	// Buffer for parts that arrive before their parent message
	const pendingPartsRef = useRef<Map<string, PartInfo[]>>(new Map())

	/**
	 * Apply any pending parts to a message and clear them from the buffer
	 */
	const applyPendingParts = useCallback(
		(messageId: string, msg: OpenCodeMessage): OpenCodeMessage => {
			const pendingParts = pendingPartsRef.current.get(messageId)
			if (!pendingParts || pendingParts.length === 0) return msg

			// Clear pending parts for this message
			pendingPartsRef.current.delete(messageId)

			// Merge pending parts with existing parts
			const existingParts = msg.parts || []
			const allParts = [...existingParts]

			for (const part of pendingParts) {
				const existingIndex = allParts.findIndex((p) => p.id === part.id)
				if (existingIndex >= 0) {
					allParts[existingIndex] = part as unknown as OpenCodeMessage["parts"][number]
				} else {
					allParts.push(part as unknown as OpenCodeMessage["parts"][number])
				}
			}

			// Sort by ID for consistent ordering
			allParts.sort((a, b) => a.id.localeCompare(b.id))

			return { ...msg, parts: allParts }
		},
		[],
	)

	// Normalize directory for comparison (remove trailing slash)
	const normalizedDirectory = directory?.replace(/\/$/, "")

	// Subscribe to SSE events for real-time updates
	useEffect(() => {
		// message.updated - handles BOTH new and updated messages
		const unsubscribeMessageUpdated = subscribe("message.updated", (event) => {
			// Filter by directory if provided
			if (normalizedDirectory && event.directory?.replace(/\/$/, "") !== normalizedDirectory) {
				return
			}

			const props = event.payload?.properties as { info?: MessageInfo } | undefined
			const info = props?.info
			if (!info || info.sessionID !== sessionId) return

			// Build OpenCodeMessage from the info
			let opencodeMsg: OpenCodeMessage = {
				info: info as unknown as OpenCodeMessage["info"],
				parts: [],
			}

			// Apply any pending parts that arrived before this message
			opencodeMsg = applyPendingParts(info.id, opencodeMsg)

			// Assistant message means we're streaming
			if (info.role === "assistant") {
				setStatus("streaming")
			}

			// Add or update message
			setRawMessages((prev) => {
				const exists = prev.some((msg) => msg.info.id === info.id)
				let updated: OpenCodeMessage[]

				if (exists) {
					updated = prev.map((msg) =>
						msg.info.id === info.id
							? applyPendingParts(info.id, { ...msg, info: opencodeMsg.info })
							: msg,
					)
				} else {
					updated = [...prev, opencodeMsg].sort((a, b) => a.info.id.localeCompare(b.info.id))
				}

				setMessages(transformMessages(updated))
				return updated
			})
		})

		// message.part.updated - streaming content (text, tool calls, etc.)
		const unsubscribePartUpdated = subscribe("message.part.updated", (event) => {
			// Filter by directory if provided
			if (normalizedDirectory && event.directory?.replace(/\/$/, "") !== normalizedDirectory) {
				return
			}

			const props = event.payload?.properties as { part?: PartInfo } | undefined
			const part = props?.part
			if (!part || part.sessionID !== sessionId) return

			// Update the parts for this message
			setRawMessages((prev) => {
				const msgIndex = prev.findIndex((msg) => msg.info.id === part.messageID)

				// If message doesn't exist yet, buffer the part for later
				if (msgIndex < 0) {
					const pending = pendingPartsRef.current.get(part.messageID) || []
					const existingIndex = pending.findIndex((p) => p.id === part.id)
					if (existingIndex >= 0) {
						pending[existingIndex] = part
					} else {
						pending.push(part)
					}
					pendingPartsRef.current.set(part.messageID, pending)
					return prev
				}

				const msg = prev[msgIndex]
				const existingParts = msg.parts || []
				const partIndex = existingParts.findIndex((p) => p.id === part.id)

				let newParts: OpenCodeMessage["parts"]
				if (partIndex >= 0) {
					// Update existing part
					newParts = [...existingParts]
					newParts[partIndex] = part as unknown as OpenCodeMessage["parts"][number]
				} else {
					// Add new part
					newParts = [...existingParts, part as unknown as OpenCodeMessage["parts"][number]].sort(
						(a, b) => a.id.localeCompare(b.id),
					)
				}

				const updated = [...prev]
				updated[msgIndex] = { ...msg, parts: newParts }
				setMessages(transformMessages(updated))
				return updated
			})
		})

		// session.status - track running/idle state
		const unsubscribeSessionStatus = subscribe("session.status", (event) => {
			// Filter by directory if provided
			if (normalizedDirectory && event.directory?.replace(/\/$/, "") !== normalizedDirectory) {
				return
			}

			const props = event.payload?.properties as
				| { sessionID?: string; status?: { running?: boolean } }
				| undefined
			if (props?.sessionID !== sessionId) return

			if (props.status?.running === false) {
				setStatus("ready")
			}
		})

		// session.updated - also signals completion
		const unsubscribeSessionUpdated = subscribe("session.updated", (event) => {
			// Filter by directory if provided
			if (normalizedDirectory && event.directory?.replace(/\/$/, "") !== normalizedDirectory) {
				return
			}

			const props = event.payload?.properties as { info?: { id?: string } } | undefined
			if (props?.info?.id === sessionId) {
				setStatus("ready")
			}
		})

		return () => {
			unsubscribeMessageUpdated()
			unsubscribePartUpdated()
			unsubscribeSessionStatus()
			unsubscribeSessionUpdated()
		}
	}, [sessionId, normalizedDirectory, subscribe, applyPendingParts])

	const handleSubmit = async (message: PromptInputMessage) => {
		if (!message.text?.trim() || status !== "ready") return

		const text = message.text.trim()
		setInput("")
		setStatus("submitted")

		try {
			const client = createClient(directory)
			await client.session.prompt({
				path: { id: sessionId },
				body: {
					parts: [{ type: "text", text }],
				},
			})
			// SSE will handle the response streaming
		} catch (error) {
			console.error("Failed to send message:", error)
			setStatus("error")
			// Reset after a moment
			setTimeout(() => setStatus("ready"), 2000)
		}
	}

	const isLoading = status === "submitted" || status === "streaming"

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<Conversation className="flex-1 min-h-0 overflow-hidden">
				{messages.length === 0 && !isLoading ? (
					<ConversationEmptyState title="No messages yet" description="Start a conversation" />
				) : (
					<ConversationContent>
						{messages
							.filter((message) => (message.parts?.length ?? 0) > 0)
							.map((message, messageIndex) => (
								<div key={message.id || `msg-${messageIndex}`} className="flex flex-col gap-3">
									{message.parts!.map((part, i) => {
										// Generate stable key from message ID + part index
										const partKey = `${message.id || messageIndex}-part-${i}`

										if (part.type === "text") {
											return (
												<Message key={partKey} from={message.role}>
													<MessageContent>
														<MessageResponse>{part.text}</MessageResponse>
													</MessageContent>
												</Message>
											)
										}

										if (part.type === "reasoning") {
											return (
												<Reasoning key={partKey} isStreaming={status === "streaming"}>
													<ReasoningTrigger />
													<ReasoningContent>{part.text}</ReasoningContent>
												</Reasoning>
											)
										}

										if (part.type?.startsWith("tool-")) {
											const toolPart = part as {
												type: `tool-${string}`
												toolCallId?: string
												title?: string
												state?:
													| "input-streaming"
													| "input-available"
													| "approval-requested"
													| "approval-responded"
													| "output-available"
													| "output-error"
													| "output-denied"
												input?: unknown
												output?: unknown
												errorText?: string
											}
											return (
												<Tool key={partKey}>
													<ToolHeader
														title={toolPart.title || toolPart.type.replace("tool-", "")}
														type={toolPart.type}
														state={toolPart.state}
													/>
													<ToolContent>
														<ToolInput input={toolPart.input} />
														<ToolOutput output={toolPart.output} errorText={toolPart.errorText} />
													</ToolContent>
												</Tool>
											)
										}

										// Unknown part type - render nothing but with a key
										return <Fragment key={partKey} />
									})}
								</div>
							))}
						{status === "submitted" && <Loader />}
					</ConversationContent>
				)}
				<ConversationScrollButton />
			</Conversation>

			{/* Fixed input at bottom - pb includes safe area for iOS Safari */}
			<div className="shrink-0 bg-background px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
				<div className="max-w-4xl mx-auto">
					<PromptInput onSubmit={handleSubmit}>
						<PromptInputBody>
							<PromptInputTextarea
								placeholder={isLoading ? "Waiting for response..." : "Send a message..."}
								value={input}
								onChange={(e) => setInput(e.target.value)}
								disabled={isLoading}
							/>
						</PromptInputBody>
						<PromptInputFooter>
							<PromptInputSubmit disabled={!input.trim() && status === "ready"} status={status} />
						</PromptInputFooter>
					</PromptInput>
				</div>
			</div>
		</div>
	)
}
