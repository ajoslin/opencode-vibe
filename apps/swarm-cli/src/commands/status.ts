/**
 * Status command - example implementation
 *
 * Shows current swarm status with progressive discovery
 */

import type { CommandContext } from "./index.js"
import { write, withLinks } from "../output.js"
import { discoverServers } from "../discovery.js"

export async function run(context: CommandContext): Promise<void> {
	const { output } = context

	// Discover servers
	const servers = await discoverServers()

	if (output.mode === "json") {
		// NDJSON with progressive discovery (_links guide next actions)
		const data = withLinks(
			{
				servers: servers.length,
				discovered: servers.map((s) => ({
					port: s.port,
					pid: s.pid,
					directory: s.directory,
				})),
			},
			servers.length === 0
				? {
						start: "cd ~/project && opencode",
						retry: "swarm-cli status",
					}
				: {
						watch: "swarm-cli watch",
						details: "swarm-cli status --json",
					},
		)
		write(output, data)
	} else {
		// Pretty output with human guidance
		if (servers.length === 0) {
			console.log("✗ No OpenCode servers found")
			console.log("\nTo connect to a server:")
			console.log("  1. Start OpenCode:  cd ~/project && opencode")
			console.log("  2. Then run:        swarm-cli status")
			console.log("\nTIP: OpenCode must be running in a project directory")
		} else {
			console.log(`🌍 Found ${servers.length} server${servers.length !== 1 ? "s" : ""}:\n`)
			for (const server of servers) {
				console.log(`  Port: ${server.port}`)
				console.log(`  PID:  ${server.pid}`)
				console.log(`  Dir:  ${server.directory}`)
				console.log("")
			}
			console.log("Next steps:")
			console.log("  swarm-cli watch              # Stream live events")
			console.log("  swarm-cli status --json      # Machine-readable output")
		}
	}
}

export const description = "Show swarm status and discovered servers"
