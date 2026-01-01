/**
 * World Stream - ADR-018 Reactive World Stream
 *
 * Exports the world stream API for consuming enriched world state
 * from SSE events. Provides both subscription and async iterator APIs.
 */

export { createWorldStream, catchUpEvents, tailEvents, resumeEvents } from "./stream.js"
export type { CatchUpResponse } from "./stream.js"
export { WorldStore } from "./atoms.js"
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
