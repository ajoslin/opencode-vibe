# AGENTS.md

## ⚠️ CRITICAL: Chrome DevTools = Subagent ONLY

**NEVER use `chrome-devtools_*` tools directly in the main conversation.**

Chrome DevTools dumps massive snapshots that will exhaust your context window. Always spawn a subagent:

```
Task(
  subagent_type="explore",
  description="Debug via Chrome DevTools",
  prompt="Use chrome-devtools_* to investigate <issue>. Report findings."
)
```

This keeps the expensive DOM/network data in disposable subagent context.

---

## Project Overview

**opencode-next** - Next.js 16 rebuild of the OpenCode web application.

This is the initial scaffold for rebuilding OpenCode's web UI from SolidJS to Next.js 16+ with React Server Components. Currently a simple Bun project that will evolve into a turborepo monorepo (`opencode-vibe`) with extracted packages.

### Current State

- ✅ Basic Bun project scaffold
- ✅ TypeScript configuration
- ✅ Architecture Decision Record (ADR 001)
- ⏳ Next.js app implementation (in progress)
- ⏳ Turborepo migration (planned)
- ⏳ Package extraction (planned)

See `docs/adr/001-nextjs-rebuild.md` for full architecture rationale and migration plan.

---

## Tech Stack

| Layer          | Technology                                                | Why                                                                |
| -------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| **Runtime**    | [Bun](https://bun.com)                                    | Fast all-in-one runtime, 10x faster installs                       |
| **Testing**    | [Vitest](https://vitest.dev)                              | Fast, isolated tests with proper ESM support                       |
| **Framework**  | Next.js 16 canary                                         | React Server Components, App Router, Turbopack                     |
| **Bundler**    | [Turbopack](https://turbo.build/pack)                     | Next-gen bundler, faster than Webpack                              |
| **Monorepo**   | [Turborepo](https://turbo.build/repo) (planned)           | Monorepo orchestration, incremental builds                         |
| **Language**   | TypeScript 5+                                             | Type safety, LSP support                                           |
| **Type Check** | [typescript-go](https://github.com/jdx/rtx)               | Bleeding edge, 10x faster than tsc                                 |
| **Linting**    | [oxlint](https://oxc.rs/)                                 | Fast Rust-based linter                                             |
| **Formatting** | [Biome](https://biomejs.dev/)                             | Fast formatter, Prettier replacement                               |
| **Chat UI**    | [ai-elements](https://github.com/vercel-labs/ai-elements) | Battle-tested React components for chat UIs                        |
| **Styling**    | Tailwind CSS                                              | Utility-first CSS (preserved from SolidJS app)                     |

### Why Next.js 16?

Current OpenCode web app (SolidJS) has:

- **Provider Hell** - 13+ nested context providers
- **Mobile UX Issues** - 5 confirmed bugs from framework mismatch
- **Maintenance Burden** - 403-line GlobalSyncProvider god object

Next.js 16 enables:

- **Flat hierarchy** - RSC eliminates provider nesting
- **Better mobile patterns** - React hooks map to scroll behavior
- **Code reduction** - ai-elements eliminates chat UI boilerplate (30-40% reduction)
- **Easier hiring** - React is 10x more common than SolidJS

---

## Directory Structure

### Current (Simple Bun Project)

```
opencode-next/
├── docs/
│   └── adr/
│       └── 001-nextjs-rebuild.md   # Architecture rationale
├── node_modules/
├── .hive/
│   └── issues.jsonl                # Work tracking
├── .cursor/
│   └── rules/                      # Cursor IDE rules
├── package.json                    # Bun dependencies
├── tsconfig.json                   # TypeScript config
├── bun.lock                        # Lockfile
├── index.ts                        # Entry point
├── README.md                       # Basic setup
├── CLAUDE.md                       # AI agent conventions
└── AGENTS.md                       # This file
```

### Planned (Turborepo Monorepo)

After extraction, directory structure will become:

```
opencode-vibe/
├── apps/
│   └── web/                        # Next.js 16 app
│       ├── app/                    # App Router pages
│       │   ├── layout.tsx
│       │   ├── page.tsx
│       │   └── session/[id]/page.tsx
│       ├── src/
│       │   ├── core/               # → @opencode/core (future package)
│       │   ├── react/              # → @opencode/react (future package)
│       │   └── ui/                 # → @opencode/ui (future package)
│       └── package.json
├── packages/
│   ├── core/                       # SDK + service layer (extracted)
│   ├── react/                      # React bindings (extracted)
│   └── ui/                         # Shared components (extracted)
├── turbo.json
└── package.json
```

**Extraction Strategy:**

1. **Phase 1** - Build in `apps/web/src/` folders
2. **Phase 2** - Extract to `packages/` when patterns stabilize
3. **No premature extraction** - Wait for third use before creating package

---

## Development Commands

### Setup

```bash
# Install dependencies (uses Bun, not npm/pnpm)
bun install
```

### Development

```bash
# Run dev server (when Next.js app exists)
bun dev

# Build for production
bun build

# Type check (ALWAYS use turbo for full monorepo check)
bun run typecheck
```

### Type Checking (MANDATORY)

**CRITICAL:** Always run typecheck via turbo to check the full monorepo:

```bash
# ✅ CORRECT - Full monorepo typecheck
bun run typecheck          # Runs: turbo type-check

# ❌ WRONG - Only checks single package
cd apps/web && bun run type-check
```

**Why?** Changes in one package can break types in another. Turbo runs `type-check` across all workspaces with proper dependency ordering.

**Before committing:** Run `bun run typecheck` from repo root. Fix all errors.

### Code Quality

```bash
# Lint (oxlint)
bun lint

# Format (biome)
bun format

# Fix formatting
bun format:fix
```

### Testing

```bash
# Run tests (uses Vitest, NOT bun test)
bun run test              # Runs: vitest run

# Watch mode
bun run test:watch        # Runs: vitest

# With coverage
bun run test:coverage     # Runs: vitest run --coverage
```

**CRITICAL:** Always use `bun run test`, never `bun test` directly. The `bun test` command uses Bun's built-in test runner which has poor isolation - stores and singletons leak state between tests causing flaky failures. Vitest with `pool: "forks"` provides proper process isolation.

---

## Conventions

### Changesets (Non-Negotiable)

**Every changeset MUST include:**

1. **A relevant quote from pdf-brain** - Search for wisdom related to your change
2. **Sick ASCII art** - Creative, characters, weird. Make it memorable.

```bash
# Find a quote
pdf-brain_search(query="<topic related to your change>")

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

**Why?** Changesets get read. Make them worth reading. The quote grounds the work in wisdom. The art makes it memorable.

**ASCII Art Inspiration (few-shot examples):**

```
# The Mass Migration 🦋
        ⋆ ˚｡⋆୨♡୧⋆ ˚｡⋆
    ,.  _~-.,               .
   ~'`~ \/,_. ~=.,,,.,,,   /|,
        /   '-._  /'   '\\=~
       |  \     \|        |
        \  '=.,_/         |
         '-.,_   '~-.,_  /
              '~.,_    '~
    ╭──────────────────────╮
    │  BUTTERFLY EFFECT    │
    │  One small change... │
    ╰──────────────────────╯

# The Wise Owl 🦉
       ___
      (o o)
     (  V  )
    /--m-m--\
    │ WHOOO │
    │ KNOWS │
    │ TYPES │
    └───────┘

# The Debugging Duck 🦆
      __
    <(o )___
     ( ._> /
      `---'
    "Have you tried mass
     explaining it to me?"

# The Swarm 🐝
       \   /
    `. _\|/_ .'
    - ( o bg) -    bzzzz
    .' /|\  `.    
       / | \      ╭─────────────╮
      🐝 🐝 🐝    │ HIVE MIND   │
     🐝 🐝 🐝 🐝  │ ACTIVATED   │
    🐝 🐝 🐝 🐝 🐝 ╰─────────────╯

# The Octopus Deploy 🐙
         ___
      .-'   '-.
     /         \
    |  (o) (o)  |
     \  .____.  /
      '.____.'
    /|\/|\/|\/|\
   / |  |  |  | \
  EIGHT ARMS FOR
  EIGHT MICROSERVICES

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

# The Tree of Knowledge 🌳
           🌟
          /|\
         / | \
        /  |  \
       /__🍎__\
          ||
          ||
      ════╧════
    FORBIDDEN FRUIT:
    node_modules/

# The Cosmic Turtle 🐢
        ___-------___
    _-~~             ~~-_
 _-~                    /~-_
/^\__/^\         /^\__/^\
  |  |  |----------|  |  |
  @  @  @          @  @  @
    ALL THE WAY DOWN
    (it's turtles)

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

**NO DOM TESTING.** If the DOM is in the mix, we already lost. Don't write tests that render React components with happy-dom/jsdom and assert on DOM output. It's brittle, slow, and tests implementation details not behavior.

- `renderHook` and `render` from `@testing-library` are code smells
- Component tests that check "does this div have this class" are worthless
- Test pure functions and hooks logic directly
- Test state management (Zustand stores) in isolation
- Test API/SDK integration with mocks
- Use E2E tests (Playwright) for actual UI verification if needed

**USE VITEST, NOT BUN TEST.** Bun test has poor isolation - Zustand stores and singletons leak state between tests causing flaky failures. Tests pass individually but fail together. Vitest with `pool: "forks"` has proper isolation.

See `@knowledge/tdd-patterns.md` for full doctrine.

### Fix Broken Shit (Non-Negotiable)

```
FIND IT → FIX IT → DON'T BLAME OTHERS
```

**If you encounter broken code, fix it. No excuses.**

1. **Pre-existing type errors?** Fix them.
2. **Failing tests unrelated to your task?** Fix them or file a cell.
3. **Broken imports?** Fix them.
4. **Dead code?** Delete it.

**What NOT to do:**

- ❌ "That's a pre-existing issue" (it's YOUR issue now)
- ❌ "Another agent broke this" (doesn't matter, fix it)
- ❌ "Out of scope" (broken code is always in scope)
- ❌ Leave `// TODO` comments for others (do it yourself)

**The codebase should be BETTER after every session, not just different.**

If you can't fix it immediately, file a hive cell with priority 1. Don't leave landmines for the next agent.

### Dependency Management

**CRITICAL:** Never edit `package.json` manually.

```bash
# ✅ CORRECT - Use bun CLI
bun add <package>           # Production dependency
bun add -d <package>        # Dev dependency
bun remove <package>        # Uninstall

# ❌ WRONG - Manual edits
# Editing package.json directly breaks lockfile integrity
```

**Why?** Bun manages lockfile hashes. Manual edits cause version drift and phantom dependency issues.

### Bun-First Development

**Use Bun instead of Node.js, npm, pnpm, or vite.**

```bash
# ✅ Use Bun equivalents
bun <file>                  # Instead of node <file>
bun test                    # Instead of jest/vitest
bun build <file.html>       # Instead of webpack/vite
bun install                 # Instead of npm/pnpm install
bunx <package>              # Instead of npx

# ❌ Don't use these
node index.ts               # Use: bun index.ts
npm install                 # Use: bun install
npx tsc                     # Use: bunx tsc
```

See `CLAUDE.md` for full Bun API reference.

### Network Authentication

**No app-level auth needed.** Tailscale provides network-level authentication.

This means:

- No OAuth flows in the web app
- No JWT tokens in cookies
- No user login/logout UI
- Trust the network layer

---

## Future Extraction Notes

### Planned Packages

When extracting to turborepo, these will become separate packages:

#### `@opencode/core`

**Framework-agnostic service layer.**

```typescript
// SDK client factory
export function createOpencodeClient(config: {
  baseUrl: string;
  directory?: string;
}): OpencodeClient

// Namespaces (15 total)
client.session.*      // CRUD, messages, prompt
client.provider.*     // List, OAuth
client.project.*      // List, current, update
client.file.*         // List, read, status
client.tool.*         // List tools, schemas
// ... 10 more
```

**Purpose:** Can be used by web, desktop (Tauri), CLI, VSCode extension.

#### `@opencode/react`

**React bindings for OpenCode.**

```typescript
// Hooks
useSession(sessionID: string)
useMessages(sessionID: string)
useSSE(baseUrl: string)
useProvider()

// Context
<OpenCodeProvider baseUrl="..." directory="...">
  {children}
</OpenCodeProvider>
```

**Purpose:** React-specific integration, usable by any React app.

#### `@opencode/ui`

**Shared UI components.**

```typescript
// Components (TBD - wait for patterns to emerge)
<ChatUI />
<CodeViewer />
<DiffViewer />
<SessionList />
```

**Purpose:** Reusable components across UIs (web, desktop).

### Extraction Triggers

**WAIT FOR THIRD USE** before extracting.

| Pattern Usage  | Action                                |
| -------------- | ------------------------------------- |
| **First use**  | Implement in `apps/web/src/`          |
| **Second use** | Note duplication, consider extraction |
| **Third use**  | Extract to `packages/`                |

**Why?** Premature abstraction is worse than duplication. Let patterns emerge organically.

---

## Architecture Highlights

### AsyncLocalStorage DI Pattern

**Preserved from backend.** Elegant, portable, no changes needed.

```typescript
// Backend: packages/opencode/src/util/context.ts
export namespace Context {
  export function create<T>(name: string) {
    const storage = new AsyncLocalStorage<T>();
    return {
      use() {
        return storage.getStore()!;
      },
      provide<R>(value: T, fn: () => R) {
        return storage.run(value, fn);
      },
    };
  }
}

// Usage: Per-directory instance scoping
Instance.provide({ directory: "/path" }, async () => {
  // All code here has access to directory context
  const dir = Instance.directory;
});
```

### SSE Real-Time Sync

**Preserved approach, integrated via Server Actions.**

```typescript
// Current (SolidJS)
const events = await client.global.event();
for await (const event of events.stream) {
  emitter.emit(event.directory, event.payload);
}

// Future (React)
export function useSSE(baseUrl: string) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const client = createOpencodeClient({ baseUrl });

    async function connect() {
      const events = await client.global.event();
      setConnected(true);

      for await (const event of events.stream) {
        listeners.current
          .get(event.directory)
          ?.forEach((fn) => fn(event.payload));
      }
    }

    connect().catch(() => setConnected(false));
  }, [baseUrl]);

  // ... subscribe logic
}
```

### OpenAPI SDK Codegen

**Preserved workflow.** No changes to SDK generation.

```
OpenAPI Spec (openapi.json)
  ↓ @hey-api/openapi-ts
Generated Types (types.gen.ts)
  ↓
Generated Client (client.gen.ts)
  ↓
SDK Wrapper (sdk.gen.ts) ← Namespaced classes
  ↓
Public API (client.ts) ← createOpencodeClient()
  ↓
Consumer (apps/web/)
```

**Source of truth:** `packages/sdk/openapi.json` (OpenAPI 3.1.1)

### SSE Real-Time Sync Architecture

**Event-driven state management with Zustand + Immer + React optimizations.**

#### Architecture Flow

```
SSE events
  ↓
store.handleSSEEvent()
  ↓
store.handleEvent()
  ↓
Zustand set() with Immer
  ↓
useOpencodeStore selectors
  ↓
useDeferredValue (intentional lag during rapid updates)
  ↓
useMemo (derived state)
  ↓
React.memo (component-level optimization)
  ↓
Component render
```

#### Key Implementation Files

| File                                            | Purpose                                              |
| ----------------------------------------------- | ---------------------------------------------------- |
| `apps/web/src/react/use-sse.tsx`                | SSE connection, event dispatch to store              |
| `apps/web/src/react/store.ts`                   | Zustand store with Immer for immutable updates       |
| `apps/web/src/react/use-messages-with-parts.ts` | Hook consuming store with `useDeferredValue`         |
| `apps/web/src/components/ai-elements/task.tsx`  | Component using `React.memo` for render optimization |

#### Store Structure (Zustand + Immer)

```typescript
// Binary search for updates (O(log n))
// Assumes ULID IDs are sortable
interface OpencodeStore {
  sessions: Session[]; // Sorted by ID
  messages: Message[]; // Sorted by ID
  parts: Part[]; // Sorted by ID

  handleSSEEvent(event); // Entry point from SSE
  handleEvent(payload); // Dispatches to specific handlers
  // ... event handlers for each entity type
}
```

Updates use binary search on sorted arrays for efficiency, but create new array references on every mutation due to Immer.

#### Known Gotchas (Discovered During Diagnosis)

##### 1. Immer Creates New Object References

**Problem:** Every store update creates new array/object references, even if content is identical.

**Impact:** `React.memo` with shallow comparison always triggers re-renders because references change.

**Example:**

```typescript
// Even if metadata.summary hasn't changed, this creates new references
set((state) => {
  const partIndex = state.parts.findIndex((p) => p.id === id);
  state.parts[partIndex].state.metadata.summary = newSummary; // New part object
});
```

**Why It Happens:** Immer's copy-on-write semantics ensure immutability by creating new objects for any mutation path.

##### 2. useDeferredValue Intentionally Lags

**Problem:** "Currently doing" status updates appear slow/laggy during rapid message streaming.

**Reality:** This is **expected behavior**, not a bug. `useDeferredValue` is designed to lag behind the actual value during rapid updates to prevent blocking the UI thread.

**Example:**

```typescript
const messages = useOpencodeStore((state) => state.messages);
const deferredMessages = useDeferredValue(messages); // Lags during rapid updates
```

**When It's Noticeable:** Most visible during AI streaming when parts update every 100-500ms. The deferred value lags by 1-2 frames.

##### 3. Deep Nesting for "Currently Doing" Data

**Problem:** The "currently doing" summary is deeply nested: `part.state.metadata.summary`.

**Impact:** Shallow comparison can't detect changes without comparing the entire `part` object graph. This makes memoization less effective.

**Example:**

```typescript
// Can't just compare part.id, need to check:
part.state?.metadata?.summary !== prevPart.state?.metadata?.summary;
```

##### 4. Binary Search Creates New Arrays

**Problem:** Store uses binary search for O(log n) updates, but Immer creates a new array reference on every insert/update.

**Impact:** Any component selecting `state.parts` gets a new reference on every SSE event, triggering re-renders.

**Why We Use It:** Binary search maintains sorted order for ULIDs and enables efficient lookups. The tradeoff is necessary for performance at scale.

#### Recommended Fixes (For Future Work)

##### 1. Content-Aware React.memo

Replace shallow comparison with deep comparison of specific fields:

```typescript
export const Task = React.memo(TaskComponent, (prev, next) => {
  // Compare actual content, not references
  return (
    prev.part.id === next.part.id &&
    prev.part.state?.metadata?.summary === next.part.state?.metadata?.summary
  );
});
```

##### 2. Zustand Shallow Equality for Selectors

Use Zustand's `shallow` comparison for derived state:

```typescript
import { shallow } from "zustand/shallow";

const messages = useOpencodeStore(
  (state) => state.messages.filter((m) => m.sessionId === id),
  shallow, // Compare array contents, not reference
);
```

##### 3. Batch Rapid SSE Updates

Buffer rapid SSE events and dispatch batched updates:

```typescript
let updateQueue: Event[] = [];
let debounceTimer: NodeJS.Timeout;

function handleSSEEvent(event: Event) {
  updateQueue.push(event);

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    store.handleBatchedEvents(updateQueue);
    updateQueue = [];
  }, 16); // One frame delay (60fps)
}
```

##### 4. Memoize Deeply Nested Selectors

Extract specific fields at the selector level to minimize re-renders:

```typescript
// Bad: Returns new object on every render
const part = useOpencodeStore((state) => state.parts.find((p) => p.id === id));

// Good: Returns primitive that can be compared
const summary = useOpencodeStore(
  (state) => state.parts.find((p) => p.id === id)?.state?.metadata?.summary,
);
```

#### Performance Characteristics

- **SSE event latency:** < 50ms from server to store update
- **Store update latency:** < 5ms (binary search + Immer)
- **useDeferredValue lag:** 1-2 frames during rapid updates (expected)
- **Render frequency:** Throttled by React's concurrent rendering

**Bottleneck:** React.memo with shallow comparison on objects with new references from Immer. Fix by implementing content-aware comparison.

---

## Known Gotchas

### SDK

- **No timeout on requests** - AI operations can run for minutes. `req.timeout = false` in client factory.
- **Directory scoping** - `x-opencode-directory` header routes requests to specific project instance.
- **Dual SDK instances** - One for SSE (no timeout), one for requests (10min timeout).

### Backend

- **No database** - All data in filesystem (`~/.local/state/opencode/`). No migrations, no transactions.
- **Event bus is global** - `GlobalBus.emit()` broadcasts to ALL clients. No per-client filtering.
- **Instance caching** - `Instance.provide()` caches per directory. Dispose required to clear cache.
- **SSE heartbeat required** - 30s heartbeat prevents WKWebView 60s timeout on mobile Safari.

### State Management

- **Binary search everywhere** - Updates use binary search on sorted arrays. Assumes IDs are sortable (they are - ULIDs).
- **Session limit** - UI loads 5 sessions by default + any updated in last 4 hours. Older sessions lazy-loaded.

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

| File                             | Purpose                                |
| -------------------------------- | -------------------------------------- |
| `docs/adr/001-nextjs-rebuild.md` | Architecture rationale, migration plan |
| `CLAUDE.md`                      | AI agent conventions, Bun usage        |
| `.hive/issues.jsonl`             | Work tracking (git-backed)             |
| `package.json`                   | Bun dependencies                       |
| `tsconfig.json`                  | TypeScript configuration               |

---

## Migration Status

**Phase 1: Scaffold & Basic Session View** (Current)

- [x] Create Next.js 16 project scaffolding (this repo)
- [x] Document architecture (ADR 001)
- [ ] Set up Tailwind, TypeScript, ESLint
- [ ] Implement layout hierarchy (no provider nesting)
- [ ] Create session list page (RSC)
- [ ] Create session detail page with ai-elements ChatUI

**Phase 2: Real-Time Sync via SSE** (Week 2)

- [ ] Implement `useSSE` hook with reconnection
- [ ] Create Server Actions for SDK calls
- [ ] Implement message streaming
- [ ] Handle part updates (tool calls, results)

**Phase 3: Full Feature Parity** (Week 3)

- [ ] Implement all session features
- [ ] Add code/diff viewers
- [ ] Implement search/filtering
- [ ] Add provider management UI

**Phase 4: Mobile-First Polish** (Week 4)

- [ ] Fix auto-scroll on session load
- [ ] Add scroll-to-bottom FAB
- [ ] Responsive design for mobile
- [ ] Test on real devices

See ADR 001 for detailed timeline and success criteria.

---

## Questions or Issues?

- **Architecture questions:** See `docs/adr/001-nextjs-rebuild.md`
- **Bun usage:** See `CLAUDE.md`
- **Work tracking:** Check `.hive/issues.jsonl` or run `bd list`
- **SDK reference:** `packages/sdk/openapi.json` (OpenAPI 3.1.1)
