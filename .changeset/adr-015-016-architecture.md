---
"@opencode-vibe/core": minor
"@opencode-vibe/react": minor
---

feat: architecture investigation and multi-directory support

```
    ╔═══════════════════════════════════════════════════════════╗
    ║   🏗️ ARCHITECTURE DEEP DIVE COMPLETE 🏗️                   ║
    ╠═══════════════════════════════════════════════════════════╣
    ║                                                           ║
    ║   ┌─────────────────────────────────────────────────┐     ║
    ║   │  ADR-015: Event Architecture Simplification     │     ║
    ║   │  • Router: 4,377 LOC confirmed DEAD             │     ║
    ║   │  • Factory: 1,160 LOC verified                  │     ║
    ║   │  • 8 core gaps identified                       │     ║
    ║   │  • 31% reduction potential (4,971 LOC)          │     ║
    ║   └─────────────────────────────────────────────────┘     ║
    ║                                                           ║
    ║   ┌─────────────────────────────────────────────────┐     ║
    ║   │  ADR-016: Core Layer Responsibility             │     ║
    ║   │  • Model B: Smart Boundary (RECOMMENDED)        │     ║
    ║   │  • Core = Computed APIs + Effect services       │     ║
    ║   │  • React = UI binding only                      │     ║
    ║   │  • Router = DEPRECATED                          │     ║
    ║   └─────────────────────────────────────────────────┘     ║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝
```

> "The purpose of abstraction is not to be vague, but to create
> a new semantic level in which one can be absolutely precise."
> — Dijkstra

## Core Layer

- Enhanced SSE with heartbeat support (mobile Safari 30s timeout fix)
- Improved connection state management with reconnection logic
- Added events.ts for SSE event type definitions
- Directory-scoped client creation

## React Layer

- New multi-directory hooks: `useMultiDirectorySessions`, `useMultiDirectoryStatus`
- New SSE state hook: `useSSEState`
- Bootstrap utilities with retry logic
- Status derivation utilities (3-source session status)
- Improved factory hook composition
- Batch update support in store

## Documentation

- ADR-015: Event Architecture Simplification (verified via 5-worker swarm)
- ADR-016: Core Layer Responsibility Model
- 8 investigation documents
- 3 audit documents
