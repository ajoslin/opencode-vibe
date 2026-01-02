# SwarmDb Events Not Appearing in Watch Feed - Investigation & Fix

## Problem Statement

The watch command was showing "only SSE events" in the event log, even though swarm.db contained 2500+ events. Users expected to see both SSE and swarm-db events.

## Investigation Process

### Step 1: Verify the "Fix" from Hivemind Memory

Memory `mem-9527414a6105e97e` claimed to have fixed the issue by adding onEvent invocation in merged-stream.ts for non-SSE sources. 

**Finding**: The fix WAS working! Created characterization test (`onevent-callback.test.ts`) that proved:
- ✅ onEvent callback IS invoked for swarm-db events
- ✅ Events have correct structure: `{ source: "swarm-db", type, properties }`
- ✅ The merged-stream.ts consumer correctly routes events

### Step 2: Identify the Real Issue

Created flood scenario test to simulate actual behavior:
- swarm.db with 2500 events
- watch command with 10-event circular buffer
- Result: Event log showed mostly SSE events, swarm-db events missing

**Root Cause Discovered**: Event buffer saturation, not callback invocation failure.

### Step 3: Trace the Event Flow

```
createSwarmDbSource initializes with lastSequence = 0
  ↓
First poll: SELECT * FROM events WHERE sequence > 0
  ↓
ALL 2500 events emitted instantly
  ↓
onEvent callback receives all 2500 events
  ↓
Circular buffer (max 10 events) saturates
  ↓
SSE events arrive and push out swarm-db events
  ↓
User sees only most recent events (SSE)
```

## The Fix

Modified `packages/core/src/world/event-source.ts` to initialize cursor to current max sequence:

```typescript
// On first poll, initialize cursor to current max sequence
// This prevents flooding with ALL historical events
if (!initialized) {
  const maxSeqResult = await client.execute({
    sql: "SELECT MAX(sequence) as max_seq FROM events",
    args: [],
  })
  const maxSeq = maxSeqResult.rows[0]?.max_seq
  if (typeof maxSeq === "number" && maxSeq > 0) {
    lastSequence = maxSeq
  }
  initialized = true
}
```

## Impact

**Before Fix**:
- First poll emits 2500+ historical events
- Circular buffer saturates immediately
- User sees only SSE events

**After Fix**:
- First poll skips historical events (cursor at max sequence)
- Only NEW events (created after watch starts) are emitted
- Both SSE and swarm-db events visible in rolling buffer
- Event log shows recent activity from all sources

## Tests Added

### 1. `onevent-callback.test.ts`
Verifies onEvent callback is invoked correctly for swarm-db events:
- Single event invocation
- Multiple event invocation
- Source tagging correctness
- Event structure validation

### 2. `swarm-db-cursor-init.test.ts`
Verifies cursor initialization prevents flood:
- Creates real libsql database with 100 historical events
- Verifies NO historical events emitted on first poll
- Verifies NEW events ARE emitted after initialization
- Uses real database to test actual polling behavior

## Key Learnings

1. **Verify Assumptions**: The memory said the fix was in merged-stream.ts, but investigation proved that code was working correctly.

2. **Multiple Root Causes**: "Events not appearing" can mean:
   - Callback not invoked (was suspected, but wrong)
   - Events emitted but pushed out of buffer (actual cause)

3. **Test Real Behavior**: Mock tests showed callback worked, but needed real database test to prove flood prevention.

4. **Bounded Buffers**: Circular buffers with small limits (10 events) are vulnerable to saturation when event sources emit bursts.

## Alternative Solutions Considered

### Option 1: Increase Buffer Size (NOT chosen)
- Pros: Simple change in watch.ts
- Cons: Doesn't solve root cause, just delays saturation

### Option 2: Filter by Timestamp (NOT chosen)
- Pros: Could show "last hour" of events
- Cons: Adds complexity, still floods if many events in window

### Option 3: Initialize Cursor to Max Sequence (CHOSEN)
- Pros: Prevents flood at source, clean separation of concerns
- Cons: Users won't see historical events (but this is expected for "watch" command)

## Files Modified

- `packages/core/src/world/event-source.ts` - Added cursor initialization
- `packages/core/src/world/onevent-callback.test.ts` - Added callback tests
- `packages/core/src/world/swarm-db-cursor-init.test.ts` - Added cursor init tests

## Files Removed

- `packages/core/src/world/swarm-db-event-flood.test.ts` - Test documented broken behavior, no longer relevant
