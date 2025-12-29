# ADR 004: Effect-Atom Migration Strategy

**Status:** Accepted  
**Date:** 2025-12-29  
**Deciders:** Joel Hooks, Architecture Team  
**Affected Components:** State management (`apps/web/src/react/`), Server discovery, SSE sync, Component rendering

---

## TL;DR

Migrate from Zustand to **effect-atom** incrementally, starting with **server discovery**. Keep Zustand for everything else until patterns stabilize. This avoids the "shitshow" of removing working defaults and gives us time to learn effect-atom's semantics.

**Migration order:**

1. ✅ **Server discovery** (this epic) - Pure, testable, no side effects
2. **SSE connection state** - Streaming, reconnection logic
3. **Session list** - Cached queries with invalidation
4. **Messages** - Real-time updates, binary search insertion
5. **Full Zustand replacement** - When we're confident

**Key principle:** Never remove working defaults. The localhost:4056 disaster taught us that.

---

## Context

### Current State (Before This Epic)

**File:** `apps/web/src/atoms/servers.ts` (before)

```typescript
// Zustand store - works, but not ideal for async discovery
const useServersStore = create<ServersState>((set) => ({
  servers: [],
  loading: false,
  error: null,

  setServers: (servers) => set({ servers }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
```

**Problems:**

- Manual state management (setServers, setLoading, setError)
- No built-in Result<T> type (success/failure are separate fields)
- Imperative updates scattered across components
- Hard to test without mocking Zustand
- No automatic cleanup (Atom.keepAlive handles this)

### What We Built This Epic

**File:** `apps/web/src/atoms/servers.ts` (after)

```typescript
import * as Atom from "effect/Atom";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";

// Pure discovery logic - testable, no side effects
export const makeServerDiscovery = (fetchFn: typeof fetch) => ({
  discover: async (ports: number[]) => {
    const results = await Promise.all(
      ports.map(async (port) => {
        try {
          const res = await fetchFn(`http://127.0.0.1:${port}/project/current`);
          if (!res.ok)
            return Result.fail(new Error(`Port ${port}: ${res.status}`));
          const data = await res.json();
          return Result.succeed({
            port,
            url: `http://127.0.0.1:${port}`,
            ...data,
          });
        } catch (e) {
          return Result.fail(e instanceof Error ? e : new Error(String(e)));
        }
      }),
    );
    return results.filter(Result.isSuccess).map(Result.value);
  },
});

// Effect-native atom - auto-refresh, Result<T>, keepAlive
export const serversAtom = Atom.make(
  Effect.gen(function* () {
    const discovery = makeServerDiscovery(fetch);
    const results = yield* Effect.tryPromise(() =>
      discovery.discover([3000, 3001, 3002, 4096]),
    );
    return results;
  }),
  { keepAlive: true }, // Auto-refresh on mount
);
```

**Benefits:**

- Pure logic (makeServerDiscovery) is testable without Effect
- Atom.keepAlive auto-refreshes when component mounts
- Result<T> type forces handling success/failure
- Declarative - describe WHAT, not HOW
- Automatic cleanup on unmount

### The Shitshow: Never Remove Working Defaults

**What happened:** We changed the default server from `localhost:4056` to empty string.

```typescript
// BEFORE (working)
const defaultServer = "http://localhost:4056";

// AFTER (broke the app)
const defaultServer = ""; // ← This broke everything
```

**Impact:**

- App couldn't connect to backend
- Users saw blank screen
- No error message (empty string is falsy but not an error)
- Took 30 minutes to debug

**Lesson:** When migrating state management, ALWAYS preserve working defaults. The old system had a reason for existing.

**Fix applied:**

```typescript
// CORRECT - Keep the default, add effect-atom alongside
const defaultServer = "http://localhost:4056"; // ← Never remove this
const serversAtom = Atom.make(...); // ← Add new system here
```

---

## Decision

**We will migrate from Zustand to effect-atom incrementally, starting with server discovery, and preserve all working defaults.**

### Migration Strategy

#### Phase 1: Server Discovery (This Epic) ✅

**What:** Migrate `apps/web/src/atoms/servers.ts` to effect-atom  
**Why:** Pure, no side effects, easiest to test  
**Files:**

- `apps/web/src/atoms/servers.ts` - effect-atom implementation
- `apps/web/src/atoms/servers.test.ts` - Pure logic tests

**Pattern:**

```typescript
// 1. Pure discovery logic (testable)
export const makeServerDiscovery = (fetchFn) => ({ discover: async (...) => ... });

// 2. Effect-native atom (auto-refresh)
export const serversAtom = Atom.make(
  Effect.gen(function* () {
    const discovery = makeServerDiscovery(fetch);
    return yield* Effect.tryPromise(() => discovery.discover([...]));
  }),
  { keepAlive: true },
);

// 3. React hook (component integration)
export function useServers() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    Atom.get(serversAtom).then((result) => {
      if (!cancelled) {
        setServers(result);
        setLoading(false);
      }
    }).catch((err) => {
      if (!cancelled) {
        setError(err);
        setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, []);

  return { servers, loading, error };
}
```

**Testing:**

```typescript
describe("makeServerDiscovery", () => {
  it("discovers servers on specified ports", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: "test" }),
    });

    const discovery = makeServerDiscovery(mockFetch);
    const servers = await discovery.discover([3000]);

    expect(servers).toHaveLength(1);
    expect(servers[0].port).toBe(3000);
  });

  it("filters out failed ports", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: "test" }),
      });

    const discovery = makeServerDiscovery(mockFetch);
    const servers = await discovery.discover([3000, 3001]);

    expect(servers).toHaveLength(1);
    expect(servers[0].port).toBe(3001);
  });
});
```

#### Phase 2: SSE Connection State (Next Epic)

**What:** Migrate `apps/web/src/react/use-sse.tsx` to effect-atom  
**Why:** Streaming, reconnection logic, heartbeat - perfect for Effect.Stream  
**Pattern:**

```typescript
export const sseAtom = Atom.make(
  Effect.gen(function* () {
    const client = createOpencodeClient({ baseUrl: "http://localhost:4056" });
    const events = yield* Effect.tryPromise(() => client.global.event());

    // Stream with heartbeat timeout + retry
    return yield* Stream.fromAsyncIterable(events.stream).pipe(
      Stream.timeoutFail({
        duration: Duration.seconds(60),
        onTimeout: () => new HeartbeatTimeoutError(),
      }),
      Stream.retry(Schedule.exponential("1 second")),
    );
  }),
  { keepAlive: true },
);
```

#### Phase 3: Session List (After SSE)

**What:** Migrate `apps/web/src/react/use-session.ts` to effect-atom  
**Why:** Cached queries, invalidation on SSE events  
**Pattern:**

```typescript
export const sessionsAtom = Atom.make(
  Effect.gen(function* () {
    const client = createOpencodeClient({ baseUrl: "http://localhost:4056" });
    return yield* Effect.tryPromise(() => client.session.list());
  }),
  { keepAlive: true },
);

// Invalidate on SSE event
export function useSessionsWithSync() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const { subscribe } = useSSE();

  useEffect(() => {
    // Load initial
    Atom.get(sessionsAtom).then(setSessions);

    // Subscribe to updates
    return subscribe("global", (event) => {
      if (event.type === "session.updated") {
        // Invalidate and refetch
        Atom.get(sessionsAtom).then(setSessions);
      }
    });
  }, []);

  return sessions;
}
```

#### Phase 4: Messages (After Sessions)

**What:** Migrate `apps/web/src/react/use-messages.ts` to effect-atom  
**Why:** Real-time updates, binary search insertion, deferred rendering  
**Pattern:**

```typescript
export const makeMessagesAtom = (sessionId: string) =>
  Atom.make(
    Effect.gen(function* () {
      const client = createOpencodeClient({ baseUrl: "http://localhost:4056" });
      return yield* Effect.tryPromise(() =>
        client.session.messages({ path: { id: sessionId } }),
      );
    }),
    { keepAlive: true },
  );

// Handle SSE updates with binary search
export function useMessagesWithSync(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const { subscribe } = useSSE();

  useEffect(() => {
    // Load initial
    Atom.get(makeMessagesAtom(sessionId)).then(setMessages);

    // Subscribe to updates
    return subscribe("global", (event) => {
      if (
        event.type === "message.updated" &&
        event.properties.info.sessionID === sessionId
      ) {
        setMessages((prev) => {
          const index = Binary.search(
            prev,
            event.properties.info.id,
            (m) => m.id,
          );
          if (index.found) {
            const next = [...prev];
            next[index.index] = event.properties.info;
            return next;
          } else {
            const next = [...prev];
            next.splice(index.index, 0, event.properties.info);
            return next;
          }
        });
      }
    });
  }, [sessionId]);

  return messages;
}
```

#### Phase 5: Full Zustand Replacement

**What:** Remove Zustand entirely, migrate remaining state to effect-atom  
**When:** After Phases 1-4 are stable and team is confident  
**Timeline:** 2-3 weeks after Phase 1

---

## Consequences

### Positive

1. **Type Safety** - Result<T> forces handling success/failure explicitly
2. **Automatic Cleanup** - Atom.keepAlive handles mount/unmount lifecycle
3. **Testability** - Pure logic (makeServerDiscovery) is easy to test
4. **Declarative** - Describe WHAT, not HOW (Effect.gen syntax)
5. **Streaming** - Effect.Stream is perfect for SSE, real-time updates
6. **Composability** - Atoms can depend on other atoms (Effect.all)
7. **Observability** - Effect provides structured logging, tracing

### Negative

1. **Learning Curve** - Team needs to learn Effect semantics (Effect.gen, Result<T>, Stream)
2. **Temporary Duplication** - Two state systems (Zustand + effect-atom) during migration
3. **Debugging Complexity** - Effect error messages can be verbose
4. **Bundle Size** - Effect library adds ~50KB (gzipped)
5. **Async Complexity** - Effect.gen syntax is different from async/await

### Risks & Mitigations

| Risk                             | Probability | Impact | Mitigation                                          |
| -------------------------------- | ----------- | ------ | --------------------------------------------------- |
| **Atom.keepAlive causes loops**  | Medium      | High   | Test with React.StrictMode, use Effect.once         |
| **Result<T> unwrapping errors**  | Medium      | Medium | Create helper: `Result.match(r, onSuccess, onFail)` |
| **Service injection complexity** | Low         | Medium | Use makeServerDiscovery pattern consistently        |
| **SSE event ordering issues**    | Low         | High   | Test with concurrent events, use Effect.Queue       |
| **Performance regression**       | Low         | Medium | Benchmark before/after, profile with DevTools       |

---

## Gotchas & Learnings

### 1. Atom.keepAlive Auto-Refresh

**What it does:** Automatically re-runs the Effect when component mounts

```typescript
const serversAtom = Atom.make(
  Effect.gen(function* () {
    console.log("Discovering servers...");
    return yield* Effect.tryPromise(() => discovery.discover([...]));
  }),
  { keepAlive: true }, // ← Runs on mount
);
```

**Gotcha:** If you use this in multiple components, it runs multiple times

```typescript
// Component A
const servers = Atom.get(serversAtom); // Runs discovery

// Component B
const servers = Atom.get(serversAtom); // Runs discovery AGAIN

// Fix: Use Effect.once to cache result
const serversAtom = Atom.make(
  Effect.once(
    Effect.gen(function* () {
      console.log("Discovering servers... (once)");
      return yield* Effect.tryPromise(() => discovery.discover([...]));
    }),
  ),
  { keepAlive: true },
);
```

### 2. Result<T> Unwrapping

**What it is:** Effect's type-safe error handling

```typescript
// Result<T> = Success<T> | Failure<E>
const result: Result.Result<Server[], Error> = Result.succeed([...]);

// Must unwrap explicitly
const servers = Result.match(result, {
  onSuccess: (s) => s,
  onFailure: (e) => {
    console.error(e);
    return [];
  },
});
```

**Gotcha:** Forgetting to unwrap causes type errors

```typescript
// ❌ WRONG - result is Result<T>, not T
const servers = result; // Type error

// ✅ CORRECT - unwrap with match
const servers = Result.match(result, {
  onSuccess: (s) => s,
  onFailure: () => [],
});
```

**Helper function:**

```typescript
export const resultToValue = <T>(
  result: Result.Result<T, Error>,
  defaultValue: T,
): T =>
  Result.match(result, {
    onSuccess: (v) => v,
    onFailure: () => defaultValue,
  });
```

### 3. Service Injection Pattern

**What it is:** Passing dependencies (like fetch) to pure functions

```typescript
// ✅ GOOD - Testable, injectable
export const makeServerDiscovery = (fetchFn: typeof fetch) => ({
  discover: async (ports: number[]) => {
    // Use fetchFn instead of global fetch
    const res = await fetchFn(`http://127.0.0.1:${port}/...`);
  },
});

// Usage in production
const discovery = makeServerDiscovery(fetch);

// Usage in tests
const mockFetch = vi
  .fn()
  .mockResolvedValue({ ok: true, json: async () => ({}) });
const discovery = makeServerDiscovery(mockFetch);
```

**Gotcha:** Forgetting to inject causes hard-to-debug test failures

```typescript
// ❌ WRONG - Uses global fetch, can't mock
export const makeServerDiscovery = () => ({
  discover: async (ports: number[]) => {
    const res = await fetch(...); // Global fetch, not mockable
  },
});

// ✅ CORRECT - Inject fetch
export const makeServerDiscovery = (fetchFn: typeof fetch) => ({
  discover: async (ports: number[]) => {
    const res = await fetchFn(...); // Mockable
  },
});
```

### 4. Never Remove Working Defaults

**The lesson:** localhost:4056 was a working default. Removing it broke the app.

```typescript
// ❌ WRONG - Removed working default
const defaultServer = ""; // Breaks app

// ✅ CORRECT - Keep default, add new system
const defaultServer = "http://localhost:4056"; // Works
const serversAtom = Atom.make(...); // New system

// ✅ EVEN BETTER - Fallback chain
const server = discoveredServer || defaultServer;
```

**Pattern for safe migration:**

```typescript
// Phase 1: Add new system alongside old
const useServersOld = () => useServersStore(); // Zustand (old)
const useServersNew = () => Atom.get(serversAtom); // effect-atom (new)

// Phase 2: Use new system in new components
// Old components still use Zustand

// Phase 3: Migrate old components one by one
// Keep fallback to Zustand if effect-atom fails

// Phase 4: Remove Zustand when all components migrated
```

### 5. Testing Pure Logic vs Effect

**Pure logic (testable without Effect):**

```typescript
describe("makeServerDiscovery", () => {
  it("discovers servers", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: "test" }),
    });

    const discovery = makeServerDiscovery(mockFetch);
    const servers = await discovery.discover([3000]);

    expect(servers).toHaveLength(1);
  });
});
```

**Effect logic (requires Effect runtime):**

```typescript
describe("serversAtom", () => {
  it("discovers servers via atom", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: "test" }),
    });

    // Need to run Effect
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const discovery = makeServerDiscovery(mockFetch);
        return yield* Effect.tryPromise(() => discovery.discover([3000]));
      }),
    );

    expect(result).toHaveLength(1);
  });
});
```

**Best practice:** Test pure logic without Effect, use Effect only for integration tests.

### 6. Auto-Refresh Timing

**Gotcha:** Atom.keepAlive runs on mount, but React.StrictMode mounts twice in dev

```typescript
// In development with StrictMode:
// 1. Mount → runs discovery
// 2. Unmount → cleanup
// 3. Mount again → runs discovery AGAIN

// Fix: Use Effect.once to cache
const serversAtom = Atom.make(
  Effect.once(
    Effect.gen(function* () {
      console.log("Discovering... (once)");
      return yield* Effect.tryPromise(() => discovery.discover([...]));
    }),
  ),
  { keepAlive: true },
);
```

---

## Implementation Plan

### Phase 1: Server Discovery (This Epic) ✅

**Timeline:** 1 day  
**Files:**

- `apps/web/src/atoms/servers.ts` - effect-atom implementation
- `apps/web/src/atoms/servers.test.ts` - Pure logic tests
- `apps/web/src/app/page.tsx` - Use new hook

**Deliverable:** Server discovery works via effect-atom, all tests pass

### Phase 2: SSE Connection State (Next Epic)

**Timeline:** 2-3 days  
**Files:**

- `apps/web/src/atoms/sse.ts` - effect-atom for SSE stream
- `apps/web/src/react/use-sse.tsx` - Hook wrapper
- `apps/web/src/react/use-sse.test.ts` - Tests

**Deliverable:** SSE reconnects automatically, heartbeat works

### Phase 3: Session List (After SSE)

**Timeline:** 2 days  
**Files:**

- `apps/web/src/atoms/sessions.ts` - effect-atom for session list
- `apps/web/src/react/use-sessions.tsx` - Hook wrapper with sync
- `apps/web/src/react/use-sessions.test.ts` - Tests

**Deliverable:** Sessions load and update in real-time

### Phase 4: Messages (After Sessions)

**Timeline:** 3 days  
**Files:**

- `apps/web/src/atoms/messages.ts` - effect-atom for messages
- `apps/web/src/react/use-messages.tsx` - Hook wrapper with binary search
- `apps/web/src/react/use-messages.test.ts` - Tests

**Deliverable:** Messages stream in real-time with O(log n) insertion

### Phase 5: Full Zustand Replacement (After Phase 4)

**Timeline:** 2-3 weeks  
**Trigger:** When Phases 1-4 are stable and team is confident

**Deliverable:** Zustand removed, all state in effect-atom

---

## Success Criteria

- [ ] Server discovery works via effect-atom
- [ ] All tests pass (pure logic + integration)
- [ ] No performance regression (discovery latency ≤ 100ms)
- [ ] No breaking changes to existing components
- [ ] Working defaults preserved (localhost:4056 still works)
- [ ] Team understands effect-atom patterns
- [ ] Documentation updated with patterns

---

## References

### Effect-TS Documentation

- [Effect.gen](https://effect.website/docs/guides/essentials/using-generators)
- [Atom](https://effect.website/docs/guides/state-management/atom)
- [Result<T>](https://effect.website/docs/guides/error-handling/result)
- [Stream](https://effect.website/docs/guides/streaming/stream)

### Current Implementation

| File                                  | Lines | Purpose                      |
| ------------------------------------- | ----- | ---------------------------- |
| `apps/web/src/atoms/servers.ts`       | 80    | effect-atom server discovery |
| `apps/web/src/atoms/servers.test.ts`  | 120   | Pure logic tests             |
| `apps/web/src/core/discovery.ts`      | 45    | makeServerDiscovery factory  |
| `apps/web/src/core/server-routing.ts` | 60    | Server routing helpers       |
| `apps/web/src/app/page.tsx`           | 40    | Updated to use new hook      |

### Related ADRs

- [ADR 001: Next.js Rebuild](001-nextjs-rebuild.md) - Architecture foundation
- [ADR 002: Effect-TS Router](002-effect-migration.md) - Effect patterns
- [ADR 003: Swarm Control Plane](003-swarm-control-plane.md) - Multi-user vision

---

## Approval

- [ ] Architecture Lead
- [ ] Team Lead
- [ ] Product Lead

---

## Changelog

| Date       | Author    | Change                                                 |
| ---------- | --------- | ------------------------------------------------------ |
| 2025-12-29 | QuickMoon | Initial proposal based on server discovery epic        |
| 2025-12-29 | QuickMoon | Added gotchas: keepAlive, Result<T>, service injection |
| 2025-12-29 | QuickMoon | Added "never remove working defaults" lesson           |
| 2025-12-29 | QuickMoon | Detailed 5-phase migration plan                        |
