# ADR 001: Next.js Rebuild of OpenCode Web

**Status:** Proposed  
**Date:** 2025-12-26  
**Deciders:** Joel Hooks, Architecture Team  
**Affected Components:** Web UI (`packages/app/`), SDK integration, real-time sync

---

## Context

OpenCode's web application (`packages/app/`) is built with SolidJS as a single-page application. While SolidJS provides excellent fine-grained reactivity, the current architecture has accumulated significant technical debt that limits our ability to:

1. **Manage complexity** - 13+ nested provider levels create cognitive overhead and make feature additions risky
2. **Deliver mobile UX** - 5 confirmed mobile issues stem from SolidJS patterns that don't translate well to touch interfaces
3. **Leverage modern patterns** - React Server Components and Server Actions provide better separation of concerns than client-side state management
4. **Reuse battle-tested components** - `ai-elements` offers production-grade chat UI components we'd otherwise rebuild

### Current Architecture Problems

#### Provider Hell (13+ Levels)

```
MetaProvider
  → ErrorBoundary
    → DialogProvider
      → MarkedProvider
        → DiffComponentProvider
          → CodeComponentProvider
            → GlobalSDKProvider
              → GlobalSyncProvider
                → ThemeProvider
                  → LayoutProvider
                    → NotificationProvider
                      → CommandProvider
                        → Router
```

**Impact:** Adding a new provider requires threading through all layers. Testing components requires mocking all ancestors. Refactoring is high-risk.

#### GlobalSyncProvider God Object (403 lines)

Located at `packages/app/src/context/global-sync.tsx`, this provider handles:

- SSE connection lifecycle and reconnection logic
- State synchronization for 8+ entity types (sessions, messages, agents, etc.)
- Multi-directory project management
- Real-time event bus for all state updates
- Error handling and recovery

**Impact:** Single point of failure for real-time sync. Changes require deep understanding of entire state machine. Hard to test in isolation.

#### Mobile UX Issues (5 Confirmed)

| Issue                                    | Severity | Root Cause                                        | Current Impact                             |
| ---------------------------------------- | -------- | ------------------------------------------------- | ------------------------------------------ |
| Auto-scroll broken on session load       | CRITICAL | SolidJS reactivity timing + DOM mutation race     | Messages don't scroll to bottom, UX broken |
| No scroll-to-bottom FAB when scrolled up | HIGH     | Custom scroll tracking, no standard patterns      | Users miss new messages                    |
| Aggressive accordion collapse on mobile  | HIGH     | Desktop-first component design                    | Context lost on small screens              |
| Code block horizontal overflow           | MEDIUM   | Fixed-width containers, no responsive breakpoints | Code unreadable on mobile                  |
| Separate mobile/desktop code paths       | MEDIUM   | Conditional rendering throughout codebase         | Maintenance burden, feature drift          |

**Root cause:** SolidJS's fine-grained reactivity doesn't map well to imperative scroll behavior. React's component lifecycle and hooks provide better patterns for this.

---

## Decision

**We will rebuild the OpenCode web application in Next.js 16+ using React Server Components and ai-elements.**

### What We're Preserving

1. **AsyncLocalStorage DI Pattern** - Elegant, portable, no changes needed
2. **SSE Real-Time Sync** - Proven approach, will integrate via Server Actions
3. **OpenAPI SDK Codegen** - Existing workflow stays intact
4. **Session/Message Data Model** - No API changes required
5. **Markdown/Diff/Code Rendering** - Migrate existing components or use ai-elements equivalents

### What We're Changing

| Aspect        | Current (SolidJS)       | New (Next.js)          | Benefit                                                 |
| ------------- | ----------------------- | ---------------------- | ------------------------------------------------------- |
| **Framework** | SolidJS                 | React 19               | Larger ecosystem, easier hiring, better mobile patterns |
| **Chat UI**   | Custom built            | ai-elements            | Battle-tested, accessible, mobile-optimized             |
| **Routing**   | @solidjs/router         | Next.js App Router     | File-based, better code splitting                       |
| **State**     | SolidJS Store + Context | RSC + Server Actions   | Reduced client-side complexity, better data flow        |
| **Real-time** | SSE via context         | SSE via Server Actions | Cleaner separation, easier to test                      |
| **Styling**   | Tailwind (existing)     | Tailwind (existing)    | No change                                               |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    NEXT.JS 16+ ARCHITECTURE                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Server Components (RSC)                    │  │
│  │  • Layout hierarchy (no provider nesting)            │  │
│  │  • Session data fetching                             │  │
│  │  • Message list rendering                            │  │
│  │  • Real-time sync via Server Actions                 │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ↓                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │        Client Components (Interactive)               │  │
│  │  • ai-elements ChatUI (message input, display)        │  │
│  │  • Code/Diff viewers (syntax highlighting)           │  │
│  │  • Scroll management (FAB, auto-scroll)              │  │
│  │  • Theme toggle, notifications                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ↓                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         Server Actions (API Bridge)                  │  │
│  │  • SSE subscription management                        │  │
│  │  • SDK client calls (with auth)                       │  │
│  │  • Session/message mutations                          │  │
│  │  • Real-time event streaming                          │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ↓                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │      OpenCode SDK (TypeScript Codegen)               │  │
│  │  • 83 endpoints across 15 namespaces                  │  │
│  │  • SSE + WebSocket patterns                           │  │
│  │  • AsyncLocalStorage DI (preserved)                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ↓                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         OpenCode Backend (Existing)                  │  │
│  │  • No changes required                                │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Decision Matrix: Fix vs Rebuild

| Criterion                         | Fix Current                | Rebuild                   | Winner  |
| --------------------------------- | -------------------------- | ------------------------- | ------- |
| **Time to resolve provider hell** | 4-6 weeks (risky refactor) | 2-3 weeks (greenfield)    | Rebuild |
| **Mobile UX improvements**        | Partial (pattern mismatch) | Complete (React patterns) | Rebuild |
| **Code reduction**                | 10-15%                     | 30-40%                    | Rebuild |
| **Team velocity post-fix**        | Moderate (still complex)   | High (simpler patterns)   | Rebuild |
| **Risk of regression**            | High (touching core)       | Low (new codebase)        | Rebuild |
| **Reuse ai-elements**             | Requires porting           | Native support            | Rebuild |
| **Hiring/onboarding**             | Harder (SolidJS niche)     | Easier (React ubiquitous) | Rebuild |
| **Preserve existing code**        | 100%                       | ~20% (SDK, utils)         | Fix     |

**Verdict:** Rebuild wins on 6/7 criteria. The 30-40% code reduction alone justifies the effort.

---

## Consequences

### Positive

1. **Reduced Complexity** - Flat component hierarchy vs 13-level provider nesting
2. **Better Mobile UX** - React patterns (hooks, effects) map naturally to scroll behavior
3. **Faster Development** - ai-elements eliminates chat UI boilerplate
4. **Easier Maintenance** - Smaller codebase (30-40% reduction), clearer data flow
5. **Better Hiring** - React is 10x more common than SolidJS
6. **Server-Side Rendering** - RSC enables better performance and SEO
7. **Type Safety** - Server Actions provide end-to-end type safety

### Negative

1. **Rewrite Effort** - ~3-4 weeks of development (mitigated by code reduction)
2. **Learning Curve** - Team needs to learn Next.js 16 patterns (RSC, Server Actions)
3. **Temporary Feature Freeze** - Can't ship new features during rebuild
4. **Testing Gaps** - New codebase needs comprehensive test coverage
5. **Dependency on ai-elements** - Adds external dependency (but well-maintained)

### Risks & Mitigations

| Risk                           | Probability | Impact | Mitigation                                          |
| ------------------------------ | ----------- | ------ | --------------------------------------------------- |
| **SSE integration complexity** | Medium      | High   | Prototype SSE + Server Actions early (Phase 2)      |
| **ai-elements API changes**    | Low         | Medium | Pin version, monitor releases, maintain fallback    |
| **Performance regression**     | Low         | Medium | Benchmark before/after, use Next.js profiling tools |
| **Mobile issues persist**      | Low         | High   | Test on real devices during Phase 4                 |
| **SDK integration breaks**     | Low         | Medium | Comprehensive integration tests, SDK versioning     |

---

## Implementation Plan

### Phase 1: Scaffold & Basic Session View (Week 1)

- [ ] Create Next.js 16 project with App Router
- [ ] Set up Tailwind, TypeScript, ESLint
- [ ] Implement layout hierarchy (no provider nesting)
- [ ] Create session list page (RSC)
- [ ] Create session detail page with ai-elements ChatUI
- [ ] Integrate OpenCode SDK (read-only)
- [ ] **Deliverable:** Basic session view, no real-time sync

### Phase 2: Real-Time Sync via SSE (Week 2)

- [ ] Implement Server Actions for SDK calls
- [ ] Set up SSE subscription in Server Action
- [ ] Create `useServerAction` hook for client-side mutations
- [ ] Implement message streaming (new messages appear in real-time)
- [ ] Handle reconnection logic
- [ ] **Deliverable:** Real-time sync working, messages update live

### Phase 3: Full Feature Parity (Week 3)

- [ ] Implement all session features (agents, commands, etc.)
- [ ] Add code/diff viewers (migrate or use ai-elements)
- [ ] Implement file operations (if applicable)
- [ ] Add search/filtering
- [ ] Implement theme switching
- [ ] **Deliverable:** Feature-complete, all existing features working

### Phase 4: Mobile-First Polish (Week 4)

- [ ] Fix auto-scroll on session load (React effect timing)
- [ ] Add scroll-to-bottom FAB
- [ ] Responsive design for mobile (single code path)
- [ ] Test on real devices (iOS Safari, Android Chrome)
- [ ] Performance optimization (Core Web Vitals)
- [ ] **Deliverable:** Mobile UX issues resolved, ship to production

### Success Criteria

- [ ] All 5 mobile UX issues resolved
- [ ] Code size reduced by 30-40% (measured in bundle size)
- [ ] Real-time sync latency ≤ 100ms (same as current)
- [ ] 95%+ test coverage for critical paths
- [ ] Lighthouse score ≥ 90 (all categories)
- [ ] Zero regressions in existing functionality
- [ ] Team comfortable with Next.js patterns

---

## Alternatives Considered

### 1. Fix Current SolidJS Architecture

**Approach:** Refactor provider hierarchy, decompose GlobalSyncProvider, fix mobile issues in place.

**Pros:**

- Preserve existing code investment
- Incremental changes, lower risk
- No learning curve for team

**Cons:**

- Provider hell is architectural, hard to fix without major refactor
- SolidJS patterns don't map well to mobile scroll behavior
- Still 30-40% more code than React equivalent
- Harder to hire for SolidJS expertise

**Verdict:** Rejected. The architectural issues are fundamental to SolidJS's design.

### 2. Migrate to Vue 3

**Approach:** Rewrite in Vue 3 with Composition API.

**Pros:**

- Simpler learning curve than React
- Excellent TypeScript support
- Good mobile patterns

**Cons:**

- Smaller ecosystem than React
- Harder to hire Vue developers
- No equivalent to ai-elements for chat UI
- Still requires rewrite effort

**Verdict:** Rejected. React ecosystem is larger, ai-elements is a force multiplier.

### 3. Use Remix Instead of Next.js

**Approach:** Rebuild in Remix with Server Actions.

**Pros:**

- Better data fetching patterns
- Excellent form handling
- Simpler mental model

**Cons:**

- Smaller ecosystem than Next.js
- Less mature than Next.js 16
- Fewer third-party integrations
- Team already familiar with Next.js

**Verdict:** Rejected. Next.js 16 is more mature and team-aligned.

---

## References

### Audit Findings

- **SolidJS Architecture Analysis:** `packages/app/src/app.tsx` (96 lines, 13 provider levels)
- **GlobalSyncProvider Code:** `packages/app/src/context/global-sync.tsx` (403 lines)
- **Mobile UX Issues:** 5 confirmed bugs with reproduction steps
- **SDK Integration:** `packages/sdk/js/` (83 endpoints, 15 namespaces)

### Technology Stack

- **Next.js 16+** - https://nextjs.org/docs
- **React Server Components** - https://react.dev/reference/rsc/server-components
- **ai-elements** - https://github.com/vercel-labs/ai-elements
- **OpenCode SDK** - `packages/sdk/js/`

### Related ADRs

- (None yet - this is the first architectural decision)

---

## Questions for Discussion

1. **Timeline:** Is 4 weeks realistic given team capacity? Should we phase this differently?
2. **ai-elements Dependency:** Are we comfortable depending on a Vercel Labs project? What's the maintenance story?
3. **Feature Freeze:** Can we pause new features during the rebuild, or do we need parallel development?
4. **Testing Strategy:** Should we do TDD (write tests first) or test after implementation?
5. **Rollback Plan:** If rebuild stalls, do we have a fallback to SolidJS?

---

## Approval

- [ ] Architecture Lead
- [ ] Team Lead
- [ ] Product Lead

---

## Changelog

| Date       | Author     | Change           |
| ---------- | ---------- | ---------------- |
| 2025-12-26 | Joel Hooks | Initial proposal |
