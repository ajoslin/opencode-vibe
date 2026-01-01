/**
 * CursorStore - Effect Layer service for persisting StreamCursor to libSQL
 *
 * Provides durable storage for event stream cursors, enabling resume-after-disconnect.
 * Database colocated with app at apps/swarm-cli/data/cursors.db
 *
 * Pattern: Effect Layer with acquireRelease for DB connection lifecycle
 */

import { Effect, Context, Layer } from "effect"
import { createClient, type Client } from "@libsql/client"
import type { StreamCursor } from "./cursor.js"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

/**
 * CursorStore service interface
 */
export interface CursorStoreService {
	/**
	 * Save cursor for a project (upsert)
	 */
	saveCursor: (cursor: StreamCursor) => Effect.Effect<void, Error, never>

	/**
	 * Load cursor for a project
	 */
	loadCursor: (projectKey: string) => Effect.Effect<StreamCursor | null, Error, never>

	/**
	 * Delete cursor for a project
	 */
	deleteCursor: (projectKey: string) => Effect.Effect<void, Error, never>
}

/**
 * CursorStore service tag
 */
export class CursorStore extends Context.Tag("CursorStore")<CursorStore, CursorStoreService>() {}

/**
 * Initialize database schema
 */
const initSchema = (client: Client): Effect.Effect<void, Error, never> =>
	Effect.tryPromise({
		try: async () => {
			await client.execute(`
				CREATE TABLE IF NOT EXISTS cursors (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					project_key TEXT UNIQUE NOT NULL,
					offset TEXT NOT NULL,
					timestamp INTEGER NOT NULL,
					updated_at INTEGER NOT NULL DEFAULT (unixepoch())
				);
				CREATE INDEX IF NOT EXISTS idx_cursors_project_key ON cursors(project_key);
			`)
		},
		catch: (error) => new Error(`Failed to initialize schema: ${error}`),
	})

/**
 * Create CursorStore service implementation
 */
const makeCursorStore = (client: Client): CursorStoreService => ({
	saveCursor: (cursor: StreamCursor) =>
		Effect.tryPromise({
			try: async () => {
				await client.execute({
					sql: `
						INSERT INTO cursors (project_key, offset, timestamp, updated_at)
						VALUES (?, ?, ?, unixepoch())
						ON CONFLICT(project_key) DO UPDATE SET
							offset = excluded.offset,
							timestamp = excluded.timestamp,
							updated_at = unixepoch()
					`,
					args: [cursor.projectKey, cursor.offset, cursor.timestamp],
				})
			},
			catch: (error) => new Error(`Failed to save cursor: ${error}`),
		}),

	loadCursor: (projectKey: string) =>
		Effect.tryPromise({
			try: async () => {
				const result = await client.execute({
					sql: "SELECT offset, timestamp, project_key FROM cursors WHERE project_key = ?",
					args: [projectKey],
				})

				if (result.rows.length === 0) {
					return null
				}

				const row = result.rows[0]
				return {
					offset: String(row.offset),
					timestamp: Number(row.timestamp),
					projectKey: String(row.project_key),
				} as StreamCursor
			},
			catch: (error) => new Error(`Failed to load cursor: ${error}`),
		}),

	deleteCursor: (projectKey: string) =>
		Effect.tryPromise({
			try: async () => {
				await client.execute({
					sql: "DELETE FROM cursors WHERE project_key = ?",
					args: [projectKey],
				})
			},
			catch: (error) => new Error(`Failed to delete cursor: ${error}`),
		}),
})

/**
 * CursorStore Effect Layer with acquireRelease lifecycle
 *
 * @param dbPath - Path to SQLite database file
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const store = yield* CursorStore
 *   yield* store.saveCursor(cursor)
 *   return yield* store.loadCursor("/project/path")
 * })
 *
 * Effect.runPromise(
 *   program.pipe(Effect.provide(CursorStoreLive("./data/cursors.db")))
 * )
 * ```
 */
export const CursorStoreLive = (dbPath: string): Layer.Layer<CursorStore, Error, never> =>
	Layer.scoped(
		CursorStore,
		Effect.acquireRelease(
			Effect.gen(function* () {
				// Ensure directory exists
				yield* Effect.sync(() => {
					mkdirSync(dirname(dbPath), { recursive: true })
				})

				// Create client
				const client = yield* Effect.sync(() =>
					createClient({
						url: `file:${dbPath}`,
					}),
				)

				// Initialize schema
				yield* initSchema(client)

				// Return service
				return makeCursorStore(client)
			}),
			(service) =>
				Effect.sync(() => {
					// Cleanup: close database connection
					// libSQL client doesn't have explicit close() in all versions
					// Connection will be cleaned up by GC
				}),
		),
	)
