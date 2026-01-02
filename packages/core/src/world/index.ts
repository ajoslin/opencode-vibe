/**
 * World Stream - ADR-018 Reactive World Stream
 *
 * Exports the world stream API for consuming enriched world state
 * from SSE events. Provides both subscription and async iterator APIs.
 */

export {
	createWorldStream,
	catchUpEvents,
	tailEvents,
	resumeEvents,
	// CLI-compatible direct server functions
	connectToServerSSE,
	tailEventsDirect,
	catchUpEventsDirect,
	resumeEventsDirect,
} from "./stream.js"
export type { CatchUpResponse, DiscoverServers } from "./stream.js"
export { WorldStore } from "./atoms.js"
export { createSSEBridge } from "./sse-bridge.js"
export type { SSEBridge } from "./sse-bridge.js"
export type {
	EnrichedMessage,
	EnrichedSession,
	WorldState,
	WorldStreamConfig,
	WorldStreamHandle,
} from "./types.js"

// Cursor-based streaming types (Effect Schema)
export { EventOffset, StreamCursor } from "./cursor.js"
export { WorldEvent } from "./events.js"
export type { EventOffset as EventOffsetType, StreamCursor as StreamCursorType } from "./cursor.js"
export type { WorldEvent as WorldEventType } from "./events.js"

// Cursor persistence (Effect Layer)
export { CursorStore, CursorStoreLive } from "./cursor-store.js"
export type { CursorStoreService } from "./cursor-store.js"

// AtomRuntime with API services
export { apiRuntimeAtom, MessageService, StatusService } from "./runtime.js"

// effect-atom based state (Map-based for O(1) SSE updates)
export {
	sessionsAtom,
	messagesAtom,
	partsAtom,
	statusAtom,
	connectionStatusAtom,
	sessionCountAtom,
	Atom,
	Registry,
} from "./atoms.js"

// Derived world atom (array-based for enrichment)
export { worldAtom } from "./derived.js"
