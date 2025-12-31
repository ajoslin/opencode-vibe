---
"@opencode-vibe/core": patch
---

fix: session-based routing for multi-TUI setups

When multiple TUI sessions run for the same directory (each spawning its own server), API requests were being routed to the wrong server. The atoms were calling `createClient(directory)` without the `sessionId`, causing directory-based routing to pick the first discovered port instead of the server that owns the session.

Fixed by passing `sessionId` to `createClient()` in:
- `SessionAtom.get()`, `SessionAtom.promptAsync()`, `SessionAtom.command()`
- `MessageAtom.list()`
- `PartAtom.list()`

This enables session-based routing which tracks which server sent events for which session, ensuring requests go to the correct server.
