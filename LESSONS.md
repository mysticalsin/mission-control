# LESSONS.md — Ultron Mission Control

## 2026-03-17 — Phase 2: Jarvis Integration Sprint

### OpenClaw Gateway: LaunchAgent Not Installed
- **Severity:** Important
- **Context:** "No OpenClaw gateway detected — running in Local Mode" banner showing in UI
- **Root cause:** `openclaw gateway install` had never been run — the LaunchAgent plist was missing from `~/Library/LaunchAgents/`
- **Fix:** `openclaw gateway install` → `openclaw doctor --repair` → gateway now listens on port 18789
- **Prevention:** Add gateway health check to project setup checklist; consider adding a "Setup Gateway" button in the admin panel

### Stale .next/types Cache After File Deletion
- **Severity:** Useful
- **Context:** Deleting `src/app/api/watchtower/` routes caused tsc to fail with "Cannot find module" errors
- **Root cause:** `.next/types/` caches route type stubs; deleting source files doesn't auto-clear the cache
- **Fix:** `rm -rf .next/types` then re-run `npx tsc --noEmit`
- **Prevention:** Always clear `.next/types` after deleting API routes or page files

### API Routes Missing Auth Guards
- **Severity:** Critical
- **Context:** `src/app/api/nanobanana/route.ts` had no `requireRole` or `rateLimiter` calls
- **Root cause:** Route was likely scaffolded quickly without following the established proxy pattern
- **Fix:** Added `requireRole`, `readLimiter`/`mutationLimiter`, `logger`, and JSON body validation
- **Prevention:** Use the standard API proxy template (auth + rate limit + logger + AbortController) for every new route. Audit all routes periodically.

### Environment Variable Naming Inconsistency
- **Severity:** Important
- **Context:** Background agent renamed `JARVIS_BACKEND_URL` to `JARVIS_BASE` instead of `JARVIS_URL`
- **Root cause:** Ambiguous variable naming — `JARVIS_BASE` is the local const, `JARVIS_URL` is the env var
- **Fix:** sed across 12 files to standardize on `process.env.JARVIS_URL`
- **Prevention:** Convention: env vars use `_URL` suffix, local consts use `_BASE`. Document in CLAUDE.md.

### Navigation Rework: Semantic Domain Grouping
- **Severity:** Useful
- **Context:** 20+ nav items were in a flat "core" group making it hard to find related tools
- **Root cause:** Items were added incrementally without re-evaluating information architecture
- **Fix:** Reorganized into 8 domain-based groups: core, growth, intelligence, media, jarvis, observe, automate, admin
- **Prevention:** When adding new panels, assign to the correct domain group immediately. Review nav structure quarterly.

### Watchtower → World View Rename + Simplification
- **Severity:** Useful
- **Context:** Watchtower had a full backend proxy but the actual product is just a link to worldmonitor.app
- **Root cause:** Over-engineering — proxying an external SaaS dashboard through our backend added complexity with no value
- **Fix:** Removed 3 backend files (route.ts, [action]/route.ts, panel), replaced with a simple World View panel containing an external link + Shadowbroker integration
- **Prevention:** Before building a backend proxy, ask: "Does this need server-side processing or is it just a link?"
