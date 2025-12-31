---
"@opencode-vibe/react": minor
---

Add `useSession()` facade hook - unified API for session management

**New Features:**
- `useSession(sessionId, options?)` - Single hook replacing 7 internal hooks
- Wraps: session data, messages, status, send action, context usage, compaction, subagent sync
- Supports `onMessage` and `onError` callbacks for side effects
- Automatic directory resolution from context

**Breaking Changes:**
- `useSession` renamed to `useSessionData` (the old simple selector)
- Import `useSessionData` if you only need session metadata

**Migration:**

```tsx
// Before (6 hooks)
const { directory } = useOpencode()
useSubagentSync({ sessionId })
const session = useSession(sessionId)
const status = useSessionStatus(sessionId)
const messages = useMessages(sessionId)
const { sendMessage, isLoading, error } = useSendMessage({ sessionId, directory })

// After (1 hook)
const { data, messages, running, isLoading, sendMessage } = useSession(sessionId, {
  onError: (err) => toast.error(err.message)
})
```

**DX Improvements:**
- Hooks per session page: 11 → 1
- Lines to render session: 150 → ~15
