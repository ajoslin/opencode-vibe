/**
 * SSEService tests - Effect.Service pattern with Layer.scoped
 *
 * Tests verify the new SSEService provides the same functionality as WorldSSE
 * but with Effect-native lifecycle management (Layer.scoped + acquireRelease).
 */

import { describe, expect, it, beforeEach } from "vitest"
import { Effect, Layer } from "effect"
import { SSEService, SSEServiceLive } from "./sse.js"
import { WorldStore } from "./atoms.js"

describe("SSEService - Effect.Service Pattern", () => {
	let store: WorldStore

	beforeEach(() => {
		store = new WorldStore()
	})

	it("provides SSEService via Layer", async () => {
		const program = Effect.gen(function* () {
			const service = yield* SSEService
			expect(service).toBeDefined()
			expect(service.start).toBeDefined()
			expect(service.stop).toBeDefined()
			expect(service.getConnectedPorts).toBeDefined()
		})

		await Effect.runPromise(program.pipe(Effect.provide(SSEServiceLive(store))))
	})

	it("can start and stop SSE connections", async () => {
		const program = Effect.gen(function* () {
			const service = yield* SSEService

			// Start connections
			yield* service.start()

			// Verify store status changed
			const stateAfterStart = store.getState()
			expect(stateAfterStart.connectionStatus).toBe("connecting")

			// Stop connections
			yield* service.stop()

			// Verify cleanup
			const stateAfterStop = store.getState()
			expect(stateAfterStop.connectionStatus).toBe("disconnected")
		})

		await Effect.runPromise(
			program.pipe(Effect.provide(SSEServiceLive(store, { serverUrl: "http://localhost:9999" }))),
		)
	})

	it("auto-cleanup on scope exit (acquireRelease pattern)", async () => {
		const program = Effect.gen(function* () {
			const service = yield* SSEService
			yield* service.start()

			// Verify connecting
			const state = store.getState()
			expect(state.connectionStatus).toBe("connecting")

			// Scope will auto-cleanup when program exits
		})

		await Effect.runPromise(
			program.pipe(Effect.provide(SSEServiceLive(store, { serverUrl: "http://localhost:9999" }))),
		)

		// After scope exit, service should be cleaned up
		const finalState = store.getState()
		expect(finalState.connectionStatus).toBe("disconnected")
	})

	it("getConnectedPorts returns Effect", async () => {
		const program = Effect.gen(function* () {
			const service = yield* SSEService
			yield* service.start()

			const ports = yield* service.getConnectedPorts()
			expect(Array.isArray(ports)).toBe(true)

			yield* service.stop()
		})

		await Effect.runPromise(
			program.pipe(Effect.provide(SSEServiceLive(store, { serverUrl: "http://localhost:9999" }))),
		)
	})
})
