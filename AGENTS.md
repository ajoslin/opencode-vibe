# AGENTS.md

## ⚠️ CRITICAL: Chrome DevTools = Subagent ONLY

**NEVER use `chrome-devtools_*` tools directly in the main conversation.**

Chrome DevTools dumps massive snapshots that exhaust context. Always spawn a subagent:

```
Task(subagent_type="explore", description="Debug via Chrome DevTools", prompt="...")
```

---

## Project Overview

**opencode-next** - Next.js 16 rebuild of OpenCode web application.

Turborepo monorepo transitioning from SolidJS to Next.js 16+ with React Server Components. Currently has working Next.js app with SSE real-time sync, Zustand state management, and ai-elements chat UI.

**Why Next.js 16?**
- Flat RSC hierarchy (eliminates 13+ nested providers)
- Better mobile patterns (React hooks map to scroll behavior)
- 30-40% code reduction with ai-elements
- React is 10x more common than SolidJS (easier hiring)

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Runtime** | Bun | Fast, 10x faster installs |
| **Testing** | Vitest | Isolated tests, proper ESM support |
| **Framework** | Next.js 16 canary | RSC, App Router, Turbopack |
| **Monorepo** | Turborepo | Incremental builds |
| **Language** | TypeScript 5+ | Type safety |
| **Linting** | oxlint | Fast Rust-based linter |
| **Formatting** | Biome | Fast Prettier replacement |
| **Chat UI** | ai-elements | Battle-tested React chat components |
| **Styling** | Tailwind CSS | Utility-first CSS |

---

## Development Commands

```bash
# Setup
bun install

# Dev
bun dev
bun build

# Type check (MANDATORY - checks full monorepo)
bun run typecheck          # Runs: turbo type-check

# Code quality
bun lint
bun format
bun format:fix

# Testing (use Vitest, NOT bun test - better isolation)
bun run test              # Runs: vitest run
bun run test:watch        # Runs: vitest
bun run test:coverage     # Runs: vitest run --coverage
```

**CRITICAL:** 
- Always `bun run typecheck` from repo root before committing
- Never use `bun test` directly - Vitest has proper isolation, Bun test leaks state

---

## Conventions

### Changesets (Non-Negotiable)

**Every changeset MUST include:**

1. **A relevant quote from pdf-brain** - Search for wisdom related to your change
2. **Sick ASCII art** - Creative, memorable

```bash
# Example changeset:
---
"@opencode-vibe/core": minor
---

feat(api): add session caching layer

```
    ╔═══════════════════════════════════════╗
    ║  🧠 CACHE ME OUTSIDE, HOW BOW DAH 🧠  ║
    ╠═══════════════════════════════════════╣
    ║     ┌─────────┐                       ║
    ║     │ REQUEST │──┐                    ║
    ║     └─────────┘  │  ┌───────┐         ║
    ║                  ├──│ CACHE │         ║
    ║     ┌─────────┐  │  └───────┘         ║
    ║     │ BACKEND │──┘                    ║
    ║     └─────────┘                       ║
    ╚═══════════════════════════════════════╝
```

> "The purpose of abstraction is not to be vague, but to create
> a new semantic level in which one can be absolutely precise."
> — Dijkstra, via pdf-brain

Adds LRU cache for session lookups, reducing backend calls by 80%.
```

**ASCII Art Inspiration:**

```
# The Swarm 🐝
       \   /
    `. _\|/_ .'
    - ( o bg) -    bzzzz
    .' /|\  `.    
       / | \      ╭─────────────╮
      🐝 🐝 🐝    │ HIVE MIND   │
     🐝 🐝 🐝 🐝  │ ACTIVATED   │
    🐝 🐝 🐝 🐝 🐝 ╰─────────────╯

# The Phoenix Refactor 🔥
          ,//
         ///
        ////
       /////
    ,///////
    ////////
     '////'
       '||'
        ||  FROM THE ASHES
        ||  OF LEGACY CODE
       /||\  WE RISE
      //||\\

# The Crab Rave 🦀
    (\/) (°,,°) (\/)
      RUST SAYS:
    "MEMORY SAFE, BB"
    
    ╱|、
  (˚ˎ 。7  
   |、˜〵          
   じしˍ,)ノ

# The Kraken Release 🦑
       ___
    .-'   '-.
   /  .-=-.  \   RELEASE
  |  /     \  |    THE
  | |  O O  | |   KRAKEN
   \|  ___  |/
    '.___.'
   /||||||||\
  //||||||||\\
```

### TDD (Non-Negotiable)

```
RED → GREEN → REFACTOR
```

**Every feature. Every bug fix. No exceptions.**

1. **RED** - Write failing test first
2. **GREEN** - Minimum code to pass
3. **REFACTOR** - Clean up while green

**Bug fixes:** Write test that reproduces bug FIRST, then fix. Prevents regression forever.

**NO DOM TESTING.** If the DOM is in the mix, we already lost.

- `renderHook` and `render` from `@testing-library` are code smells
- Test pure functions and hooks logic directly
- Test state management (Zustand stores) in isolation
- Test API/SDK integration with mocks
- Use E2E tests (Playwright) for actual UI verification

**USE VITEST, NOT BUN TEST.** Bun test has poor isolation - Zustand stores and singletons leak state between tests causing flaky failures.

### Fix Broken Shit (Non-Negotiable)

```
FIND IT → FIX IT → DON'T BLAME OTHERS
```

**If you encounter broken code, fix it. No excuses.**

1. Pre-existing type errors? Fix them.
2. Failing tests unrelated to your task? Fix them or file a cell.
3. Broken imports? Fix them.
4. Dead code? Delete it.

**What NOT to do:**
- ❌ "That's a pre-existing issue" (it's YOUR issue now)
- ❌ "Another agent broke this" (doesn't matter, fix it)
- ❌ "Out of scope" (broken code is always in scope)
- ❌ Leave `// TODO` comments for others (do it yourself)

**The codebase should be BETTER after every session, not just different.**

If you can't fix it immediately, file a hive cell with priority 1.

### Dependency Management

**CRITICAL:** Never edit `package.json` manually.

```bash
# ✅ CORRECT - Use bun CLI
bun add <package>           # Production dependency
bun add -d <package>        # Dev dependency
bun remove <package>        # Uninstall

# ❌ WRONG - Manual edits break lockfile integrity
```

### Bun-First Development

**Use Bun instead of Node.js, npm, pnpm, or vite.**

```bash
# ✅ Use Bun equivalents
bun <file>                  # Instead of node <file>
bun test                    # Instead of jest/vitest
bun build <file.html>       # Instead of webpack/vite
bun install                 # Instead of npm/pnpm install
bunx <package>              # Instead of npx
```

### Network Authentication

**No app-level auth needed.** Tailscale provides network-level authentication.

- No OAuth flows in the web app
- No JWT tokens in cookies
- No user login/logout UI
- Trust the network layer

---

## Architecture Highlights

### AsyncLocalStorage DI Pattern

**Preserved from backend.** Elegant, portable, per-directory instance scoping.

```typescript
// Backend: packages/opencode/src/util/context.ts
export namespace Context {
  export function create<T>(name: string) {
    const storage = new AsyncLocalStorage<T>();
    return {
      use() { return storage.getStore()!; },
      provide<R>(value: T, fn: () => R) { return storage.run(value, fn); }
    };
  }
}

// Usage: Per-directory instance scoping
Instance.provide({ directory: "/path" }, async () => {
  const dir = Instance.directory; // All code has access to directory context
});
```

### SSE Real-Time Sync Architecture

**Event-driven state management with jotai atoms + Core API.**

```
SSE events → atom invalidation → Core API refetch → useMemo → React.memo → render
```

**Key Files:**
- `packages/react/src/hooks/internal/use-sse.ts` - SSE connection, atom invalidation
- `packages/react/src/hooks/internal/use-messages-with-parts.ts` - Messages hook with useMemo
- `packages/core/src/api/*.ts` - Core API for data fetching
- `apps/web/src/components/ai-elements/task.tsx` - `React.memo` optimization

**Architecture:**

```typescript
// No client-side store - hooks call Core API directly
// Atoms track SSE connection state and trigger refetch
export function useMessagesWithParts(sessionId: string): OpencodeMessage[] {
  const messages = useOpencodeStore((state) => state.directories[dir]?.messages[sessionId])
  const partsMap = useOpencodeStore((state) => state.directories[dir]?.parts)
  
  return useMemo(() => {
    return messages.map(msg => ({ info: msg, parts: partsMap?.[msg.id] ?? [] }))
  }, [messages, partsMap])
}
```

### OpenAPI SDK Codegen

**Preserved workflow.** No changes to SDK generation.

```
OpenAPI Spec (openapi.json) → @hey-api/openapi-ts → Generated Types/Client
  → SDK Wrapper (namespaced classes) → createOpencodeClient() → Consumer
```

**Source of truth:** `packages/sdk/openapi.json` (OpenAPI 3.1.1)

---

## Known Gotchas

### Zustand Store Pattern (CRITICAL)

**`useOpencodeStore()` returns a new reference on every render.** This causes infinite loops when used in useEffect/useCallback dependencies.

```typescript
// ❌ BAD - Causes infinite network requests
const store = useOpencodeStore();
useEffect(() => {
  store.initDirectory(directory);
}, [directory, store]); // store changes every render → infinite loop

// ✅ GOOD - Use getState() for actions inside effects
useEffect(() => {
  useOpencodeStore.getState().initDirectory(directory);
}, [directory]);

// ✅ GOOD - Helper function pattern
const getStoreActions = () => useOpencodeStore.getState();
useEffect(() => {
  getStoreActions().initDirectory(directory);
}, [directory]);
```

**The Rule:**
- Use `getState()` for **actions** inside effects/callbacks (stable reference)
- Use the hook return value only for **selectors** (subscribing to state changes)

**Files that follow this pattern:**
- `apps/web/src/react/provider.tsx` - Uses `getStoreActions()` helper
- `apps/web/src/react/use-multi-server-sse.ts` - Uses `getState()` in callback
- `apps/web/src/app/projects-list.tsx` - Uses `getState()` in async functions
- `apps/web/src/app/session/[id]/session-layout.tsx` - Uses `getState()` in useEffect

### Immer + React.memo

**Problem:** Every store update creates new array/object references, even if content is identical.

**Impact:** `React.memo` with shallow comparison always triggers re-renders because references change.

```typescript
// Even if metadata.summary hasn't changed, this creates new references
set((state) => {
  const partIndex = state.parts.findIndex((p) => p.id === id);
  state.parts[partIndex].state.metadata.summary = newSummary; // New part object
});
```

**Fix:** Content-aware React.memo comparison

```typescript
export const Task = React.memo(TaskComponent, (prev, next) => {
  return (
    prev.part.id === next.part.id &&
    prev.part.state?.metadata?.summary === next.part.state?.metadata?.summary
  );
});
```



### SDK Gotchas

- **No timeout on requests** - AI operations can run for minutes. `req.timeout = false` in client factory.
- **Directory scoping** - `x-opencode-directory` header routes requests to specific project instance.
- **Dual SDK instances** - One for SSE (no timeout), one for requests (10min timeout).

### Backend Gotchas

- **No database** - All data in filesystem (`~/.local/state/opencode/`). No migrations, no transactions.
- **Event bus is global** - `GlobalBus.emit()` broadcasts to ALL clients. No per-client filtering.
- **Instance caching** - `Instance.provide()` caches per directory. Dispose required to clear cache.
- **SSE heartbeat required** - 30s heartbeat prevents WKWebView 60s timeout on mobile Safari.

### State Management Gotchas

- **Binary search everywhere** - Updates use binary search on sorted arrays. Assumes IDs are sortable (they are - ULIDs).
- **Session limit** - UI loads 5 sessions by default + any updated in last 4 hours. Older sessions lazy-loaded.

---

## References

### Documentation

- [ADR 001: Next.js Rebuild](docs/adr/001-nextjs-rebuild.md) - Full architecture rationale
- [Bun API Docs](node_modules/bun-types/docs/) - Local Bun reference
- [Next.js Docs](https://nextjs.org/docs) - Next.js 16 App Router
- [ai-elements](https://github.com/vercel-labs/ai-elements) - Chat UI components

### Related Projects

- `packages/opencode` - Backend (Hono server, AsyncLocalStorage DI)
- `packages/sdk` - OpenAPI-generated SDK with 15 namespaces
- `packages/app` - Current SolidJS app (being replaced)

### Key Files

| File | Purpose |
|------|---------|
| `docs/adr/001-nextjs-rebuild.md` | Architecture rationale, migration plan |
| `CLAUDE.md` | AI agent conventions, Bun usage |
| `.hive/issues.jsonl` | Work tracking (git-backed) |
| `package.json` | Bun dependencies |
| `tsconfig.json` | TypeScript configuration |

---

## Questions or Issues?

- **Architecture questions:** See `docs/adr/001-nextjs-rebuild.md`
- **Bun usage:** See `CLAUDE.md`
- **Work tracking:** Check `.hive/issues.jsonl` or run `bd list`
- **SDK reference:** `packages/sdk/openapi.json` (OpenAPI 3.1.1)
