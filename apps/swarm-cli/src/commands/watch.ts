/**
 * Watch command - live event stream with cursor resumption
 *
 * Streams events in real-time using createWorldStream from core.
 * Uses atom-based WorldStore for reactive state management.
 *
 * Usage:
 *   swarm-cli watch                           # Watch from now
 *   swarm-cli watch --cursor-file .cursor     # Persist cursor
 *   swarm-cli watch --json                    # NDJSON output
 */

import { createWorldStream } from "@opencode-vibe/core/world"
import type { CommandContext } from "./index.js"
import { write, writeError, loadCursor, saveCursor, withLinks, formatNextSteps } from "../output.js"
import { discoverServers } from "../discovery.js"
import { adaptCoreWorldState, formatWorldState } from "../world-state.js"

interface WatchOptions {
	cursorFile?: string // Persist cursor after each event
}

/**
 * Parse command-line arguments into options
 */
function parseArgs(args: string[]): WatchOptions {
	const options: WatchOptions = {}

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]

		switch (arg) {
			case "--cursor-file":
				options.cursorFile = args[++i]
				break
			case "--help":
			case "-h":
				showHelp()
				process.exit(0)
		}
	}

	return options
}

/**
 * Show command help
 */
function showHelp(): void {
	console.log(`
╔═════════════════════════════════════════╗
║      👁️  WATCH - Live Stream 👁️          ║
╚═════════════════════════════════════════╝

Stream world state in real-time using atom-based reactive state.

Usage:
  swarm-cli watch [options]

Options:
  --cursor-file <path>   Persist cursor after each update
  --json                 NDJSON output (machine-readable)
  --help, -h             Show this message

SIGINT Handling:
  Press Ctrl+C to gracefully stop the stream.

Examples:
  swarm-cli watch --cursor-file .cursor --json
  swarm-cli watch                    # Watch from now

Output:
  Shows aggregated world state, refreshed on each SSE event.
`)
}

/**
 * Run the watch command
 */
export async function run(context: CommandContext): Promise<void> {
	const { args, output } = context
	const options = parseArgs(args)

	// Cursor file can come from global options OR command options
	const cursorFile = output.cursorFile || options.cursorFile

	// Discover servers
	const servers = await discoverServers()

	if (servers.length === 0) {
		if (output.mode === "json") {
			writeError("No servers found", { servers: 0 })
		} else {
			console.log("✗ No OpenCode servers found")
			console.log("\nTo connect to a server:")
			console.log("  1. Start OpenCode:  cd ~/project && opencode")
			console.log("  2. Then run:        swarm-cli watch")
		}
		return
	}

	// Setup graceful shutdown
	let running = true
	let stream: ReturnType<typeof createWorldStream> | null = null

	process.on("SIGINT", async () => {
		running = false
		if (output.mode === "pretty") {
			console.log("\n\nGracefully shutting down...")
		}
		if (stream) {
			await stream.dispose()
		}
		process.exit(0)
	})

	try {
		if (output.mode === "pretty") {
			console.log(`Watching world state from ${servers.length} server(s)... (Ctrl+C to stop)\n`)
		}

		// Create world stream - it bootstraps with full data and wires SSE
		stream = createWorldStream({
			baseUrl: `http://127.0.0.1:${servers[0]!.port}`,
		})

		let updateCount = 0
		let lastWorldUpdate = 0
		const WORLD_UPDATE_INTERVAL = 500 // Update world view at most every 500ms

		// Subscribe to world state changes
		const unsubscribe = stream.subscribe((coreState) => {
			if (!running) return

			updateCount++
			const now = Date.now()

			// Throttle updates to avoid flickering
			if (now - lastWorldUpdate < WORLD_UPDATE_INTERVAL) {
				return
			}
			lastWorldUpdate = now

			const world = adaptCoreWorldState(coreState)

			if (output.mode === "json") {
				const worldWithLinks = withLinks(
					{
						...world,
						updateCount,
						projects: world.projects.map((p) => ({
							directory: p.directory,
							sessionCount: p.sessions.length,
							activeCount: p.activeCount,
							totalMessages: p.totalMessages,
						})),
					},
					{
						status: "swarm-cli status",
					},
				)
				write(output, worldWithLinks)
			} else {
				// Clear screen and redraw world state
				console.clear()
				console.log(formatWorldState(world))
				console.log(`\nUpdates received: ${updateCount}`)
				console.log("Watching for changes... (Ctrl+C to stop)")
			}

			// Persist cursor if configured
			if (cursorFile) {
				saveCursor(cursorFile, String(updateCount)).catch((err) => {
					console.error(`[cursor] Failed to save: ${err}`)
				})
			}
		})

		// Show initial state
		const initialState = await stream.getSnapshot()
		const initialWorld = adaptCoreWorldState(initialState)

		if (output.mode === "pretty") {
			console.log(formatWorldState(initialWorld))
			console.log("\n✓ Connected! Watching for changes...\n")
			console.log(
				formatNextSteps([
					"💾 Persist cursor: swarm-cli watch --cursor-file .cursor",
					"📊 Status: swarm-cli status",
				]),
			)
		}

		// Keep running until SIGINT
		await new Promise<void>((resolve) => {
			const checkInterval = setInterval(() => {
				if (!running) {
					clearInterval(checkInterval)
					unsubscribe()
					resolve()
				}
			}, 100)
		})
	} catch (error) {
		const errorDetails = {
			error: error instanceof Error ? error.message : String(error),
			...(output.mode === "json" && {
				_links: {
					retry: "swarm-cli watch",
					status: "swarm-cli status",
					help: "swarm-cli watch --help",
				},
			}),
		}
		writeError("Stream failed", errorDetails)

		if (output.mode === "pretty") {
			console.error(
				formatNextSteps([
					"🔄 Retry: swarm-cli watch",
					"📡 Check status: swarm-cli status",
					"❓ Get help: swarm-cli watch --help",
				]),
			)
		}
		process.exit(1)
	}
}

export const description = "Watch live world state stream"
