---
"@opencode-vibe/react": patch
"@opencode-vibe/core": patch
---

fix: real-time UI updates for sessions and Task cards

```
    ╔═════════════════════════════════════════════════════════════╗
    ║   ⚡ REAL-TIME REFRESH RESURRECTION ⚡                       ║
    ╠═════════════════════════════════════════════════════════════╣
    ║                                                             ║
    ║   BEFORE:           AFTER:                                  ║
    ║   ┌─────────┐       ┌─────────┐                             ║
    ║   │ Session │       │ Session │ ← Status updates            ║
    ║   │ ??? lag │   →   │ ✓ LIVE  │   instantly visible!        ║
    ║   └─────────┘       └─────────┘                             ║
    ║                                                             ║
    ║   ┌─────────┐       ┌─────────┐                             ║
    ║   │  Task   │       │  Task   │ ← Metadata.summary          ║
    ║   │ frozen  │   →   │ flowing │   updates flow through      ║
    ║   └─────────┘       └─────────┘                             ║
    ║                                                             ║
    ║   Bug 1: Session status stale on projects-list              ║
    ║   Fix: Bootstrap now fetches SDK status immediately         ║
    ║                                                             ║
    ║   Bug 2: Task cards not updating during sub-agent work      ║
    ║   Fix: Memo now checks _opencode metadata on messages       ║
    ║        + Fixed pending→running state transition logic       ║
    ║                                                             ║
    ╚═════════════════════════════════════════════════════════════╝
```

> "Premature optimization is the root of all evil, but we should
> not pass up opportunities to make things work correctly."
> — Paraphrasing Knuth on debugging

## Fixes

### Session Status Lag (projects-list.tsx)
- Bootstrap now properly fetches SDK status on initialization
- Live sessions from SSE events now merge correctly with server-rendered sessions
- Deduplication uses Map to prefer live data over stale initial data

### Task Card Real-Time Updates (tool.tsx)
- Fixed React.memo comparison for Task tool parts
- Now correctly handles pending→running state transitions
- Compares `_opencode` metadata when present on messages
- Sub-agent activity summaries now update in real-time

### MessageRenderer Memo (session-messages.tsx)
- Added `_opencode` metadata to comparison logic
- Tool invocations and results now trigger proper re-renders
- Prevents stale UI during AI streaming
