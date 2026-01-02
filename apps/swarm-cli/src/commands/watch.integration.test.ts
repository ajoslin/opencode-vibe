/**
 * Integration test for watch command with streaming aggregation
 *
 * This test verifies that rapid message.part.updated events are aggregated
 * into summary lines instead of flooding the event log.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { StreamingAggregator, type SSEEventInfo } from "../output.js"

describe("watch command streaming integration", () => {
	let aggregator: StreamingAggregator
	let eventLog: string[]
	const MAX_EVENTS = 10

	beforeEach(() => {
		aggregator = new StreamingAggregator({ throttleMs: 100 })
		eventLog = []
	})

	afterEach(() => {
		eventLog = []
	})

	it("aggregates 47 message.part.updated events into ~3-5 summary lines", async () => {
		const sessionID = "ses_abc123"
		const messageID = "msg_def456"

		// Simulate 47 rapid part.updated events (like actual streaming)
		for (let i = 1; i <= 47; i++) {
			const event: SSEEventInfo = {
				type: "message.part.updated",
				properties: {
					sessionID,
					messageID,
					id: `part_${i}`,
				},
			}

			const result = aggregator.process(event)
			if (result) {
				eventLog.push(result.line)
				if (eventLog.length > MAX_EVENTS) {
					eventLog.shift()
				}
			}

			// Simulate time passing (some events come fast, some slow)
			if (i % 10 === 0) {
				await new Promise((resolve) => setTimeout(resolve, 110))
			}
		}

		// Force final summary
		const finalEvent: SSEEventInfo = {
			type: "session.completed",
			properties: { sessionID },
		}
		const finalResult = aggregator.process(finalEvent)
		if (finalResult) {
			eventLog.push(finalResult.line)
		}

		// Should have ~5 entries (1 "streaming started" + 4 summaries + 1 final)
		expect(eventLog.length).toBeGreaterThanOrEqual(3)
		expect(eventLog.length).toBeLessThanOrEqual(6)

		// All entries should be summary lines or session.completed
		for (const line of eventLog) {
			expect(line).toMatch(/streaming|session\.completed/)
		}

		// At least one line should show part count
		const hasPartCount = eventLog.some((line) => line.includes("parts"))
		expect(hasPartCount).toBe(true)
	})

	it("maintains event log at max 10 entries during heavy streaming", async () => {
		const sessionID = "ses_abc123"

		// Simulate 100 events with multiple sessions
		for (let i = 1; i <= 100; i++) {
			const event: SSEEventInfo = {
				type: "message.part.updated",
				properties: {
					sessionID: i % 3 === 0 ? "ses_1" : i % 3 === 1 ? "ses_2" : "ses_3",
					messageID: `msg_${i}`,
					id: `part_${i}`,
				},
			}

			const result = aggregator.process(event)
			if (result) {
				eventLog.push(result.line)
				if (eventLog.length > MAX_EVENTS) {
					eventLog.shift()
				}
			}

			// Occasional delay
			if (i % 20 === 0) {
				await new Promise((resolve) => setTimeout(resolve, 110))
			}
		}

		// Event log should never exceed MAX_EVENTS
		expect(eventLog.length).toBeLessThanOrEqual(MAX_EVENTS)
	})

	it("shows correct format for summary lines", async () => {
		const sessionID = "ses_abc123"

		// Stream 10 events
		for (let i = 1; i <= 10; i++) {
			const event: SSEEventInfo = {
				type: "message.part.updated",
				properties: { sessionID, messageID: "msg_1", id: `part_${i}` },
			}
			const result = aggregator.process(event)
			if (result) {
				eventLog.push(result.line)
			}
		}

		// Wait for throttle
		await new Promise((resolve) => setTimeout(resolve, 110))

		// Trigger summary
		const event: SSEEventInfo = {
			type: "message.part.updated",
			properties: { sessionID, messageID: "msg_1", id: "part_11" },
		}
		const result = aggregator.process(event)
		if (result) {
			eventLog.push(result.line)
		}

		// Find summary line
		const summaryLine = eventLog.find((line) => line.includes("parts"))
		expect(summaryLine).toBeDefined()
		expect(summaryLine).toMatch(/\[.*\] \d{2}:\d{2}:\d{2} streaming/)
		expect(summaryLine).toContain("ses_abc123")
		expect(summaryLine).toMatch(/\d+ parts/)
	})

	it("handles interleaved streaming and regular events", async () => {
		const sessionID = "ses_abc123"

		// Start streaming
		for (let i = 1; i <= 5; i++) {
			const event: SSEEventInfo = {
				type: "message.part.updated",
				properties: { sessionID, messageID: "msg_1", id: `part_${i}` },
			}
			const result = aggregator.process(event)
			if (result) {
				eventLog.push(result.line)
			}
		}

		// Regular event (should finalize stream)
		const statusEvent: SSEEventInfo = {
			type: "session.status",
			properties: { sessionID, status: "running" },
		}
		const statusResult = aggregator.process(statusEvent)
		if (statusResult) {
			eventLog.push(statusResult.line)
		}

		// Should have: "streaming started" + regular event
		expect(eventLog.length).toBeGreaterThanOrEqual(2)
		expect(eventLog[eventLog.length - 1]).toContain("session.status")
	})
})
