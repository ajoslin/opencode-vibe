/**
 * Server Discovery API Route
 *
 * Discovers running opencode servers by scanning processes.
 * Uses lsof to find processes listening on ports with "bun" or "opencode" in the command.
 * Verifies each candidate by hitting /project endpoint and captures the directory.
 *
 * Returns: Array<{ port: number; pid: number; directory: string }>
 *
 * This enables routing messages to the correct server based on directory!
 *
 * Performance optimizations:
 * - Parallel verification of all candidate ports
 * - 2s timeout on lsof command
 * - 300ms timeout on each verification request
 * - Results cached for 2s via Cache-Control header
 */

import { exec } from "child_process"
import { promisify } from "util"
import { NextResponse } from "next/server"

const execAsync = promisify(exec)

interface DiscoveredServer {
	port: number
	pid: number
	directory: string
}

interface CandidatePort {
	port: number
	pid: number
}

/**
 * Verify a port is actually an opencode server and get its directory
 * Returns null if not a valid opencode server
 */
async function verifyOpencodeServer(candidate: CandidatePort): Promise<DiscoveredServer | null> {
	try {
		// Use /project/current to get the current project for this server instance
		// Short timeout - if server is healthy it should respond fast
		const res = await fetch(`http://127.0.0.1:${candidate.port}/project/current`, {
			signal: AbortSignal.timeout(300),
		})
		if (!res.ok) return null

		const project = await res.json()
		const directory = project.worktree

		// Filter out invalid directories (root "/" or empty)
		if (!directory || directory === "/" || directory.length <= 1) {
			return null
		}

		return {
			port: candidate.port,
			pid: candidate.pid,
			directory,
		}
	} catch {
		return null
	}
}

export async function GET() {
	try {
		// Find all listening TCP ports for bun/opencode processes
		// Add timeout to prevent lsof from hanging
		const { stdout } = await execAsync(
			`lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | grep -E 'bun|opencode' | awk '{print $2, $9}'`,
			{ timeout: 2000 },
		)

		// Parse candidates
		const candidates: CandidatePort[] = []
		const seen = new Set<number>()

		for (const line of stdout.trim().split("\n")) {
			if (!line) continue
			const [pid, address] = line.split(" ")
			// address format: *:4096 or 127.0.0.1:4096
			const portMatch = address?.match(/:(\d+)$/)
			if (!portMatch) continue

			const port = parseInt(portMatch[1], 10)
			if (seen.has(port)) continue
			seen.add(port)

			candidates.push({ port, pid: parseInt(pid, 10) })
		}

		// Verify all candidates in parallel
		const results = await Promise.all(candidates.map(verifyOpencodeServer))

		// Filter out nulls (failed verifications)
		const servers = results.filter((s): s is DiscoveredServer => s !== null)

		// Return with cache header to reduce polling load
		return NextResponse.json(servers, {
			headers: {
				"Cache-Control": "private, max-age=2",
			},
		})
	} catch {
		return NextResponse.json([])
	}
}
