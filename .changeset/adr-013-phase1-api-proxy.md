---
"@opencode-vibe/core": minor
---

feat(api): add API proxy route for CORS-free mobile access

Implements ADR-013 Phase 1: API Proxy Route

- Add `/api/opencode/[port]/[[...path]]` catch-all proxy route
- Proxy all HTTP methods (GET, POST, PUT, DELETE, PATCH, OPTIONS)
- Preserve headers (x-opencode-directory, content-type)
- Stream request bodies with duplex: "half"
- Port validation (1024-65535 range)
- Error handling (400 for validation, 503 for connection failures)
- Update client URLs to use `/api/opencode/${port}` instead of `http://127.0.0.1:${port}`

This eliminates CORS issues when accessing OpenCode from mobile Safari via Tailscale.
