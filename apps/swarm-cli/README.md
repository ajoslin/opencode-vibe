# World Stream Visualizer

Terminal visualizer for OpenCode session data via SSE streaming.

## Features

- 📊 Session statistics (count, status distribution)
- 🪙 Token usage tracking (per-session and average)
- 🔄 Live SSE updates with auto-reconnect
- 🎨 Gradient color-coded sessions
- ⚡ Streaming message indicators
- 🖥️ Both visual and JSON output modes

## Quick Start

### With Mock Backend (Testing)

1. Start the mock server:
```bash
cd apps/world-viz
bun run dev:mock
```

2. In another terminal, run the visualizer:
```bash
cd apps/world-viz
bun run dev
```

### With Real OpenCode Backend

1. Ensure you have the OpenCode backend running on `localhost:1999` (or custom port)

2. Run the visualizer:
```bash
cd apps/world-viz
bun run dev

# Or connect to custom URL:
bun run dev -- --url http://localhost:3000
```

## Usage

```bash
world-viz                    # Visual mode (default)
world-viz --json             # JSON output mode
world-viz --url <url>        # Custom backend URL (default: http://localhost:1999)
world-viz --help             # Show help
```

## Display Output

The visualizer shows:

- **Connection status**: Connected/connecting/error with last update time
- **Session count**: Total sessions and active session count
- **Status distribution**: Running, completed, idle session counts
- **Token usage**: Average context usage percentage across all sessions
- **Session list**: Each session with:
  - Active indicator (● for active, ○ for inactive)
  - Title and directory
  - Message count, context %, and status
  - Streaming indicators for active messages

## Development

### Scripts

```bash
bun run dev           # Run CLI with default settings
bun run dev:mock      # Start mock backend server
bun run build         # Build distributable
bun run type-check    # TypeScript type checking
```

### Mock Backend

The included `mock-server.ts` provides a test backend that:
- Serves 3 sample sessions
- Simulates SSE events every 3 seconds
- Runs on `localhost:1999`

Routes:
- `GET /session` - List all sessions
- `GET /session/status` - Session status map
- `GET /events` - SSE event stream

## Error Handling

The CLI includes comprehensive error handling:

- Connection failures show troubleshooting tips
- Automatic detection of missing backend
- Graceful shutdown on Ctrl+C
- Network error recovery with auto-reconnect

## Architecture

Built on top of `@opencode-vibe/core/world`:
- `WorldStore` - Binary search-based state management
- `createWorldStream()` - SSE consumer with async iterator API
- `MultiServerSSE` - Multi-server discovery and routing

## Technical Details

### Type Errors Fixed

- Added non-null assertions for `COLORS` array access
- Fixed all TypeScript strict mode errors in `render.ts`

### Backend Integration

- Uses `createOpencodeClient({ baseUrl })` for CLI usage
- Supports both proxy URLs (Next.js) and direct URLs (CLI)
- Automatic baseUrl configuration from `--url` flag

### Session Data Flow

```
OpenCode Backend → SSE Events → WorldStore → render() → Terminal
```

1. Bootstrap fetches initial data via REST API (`GET /session`, `GET /session/status`)
2. SSE connection established for live updates
3. `WorldStore` maintains sorted arrays with binary search updates
4. Render loop updates terminal display via `log-update`
