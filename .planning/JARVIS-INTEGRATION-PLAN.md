# Jarvis → Ultron Integration: Master Implementation Plan

> **Project:** Clawbot Jarvis Feature Integration into Ultron Mission Control
> **Owner:** Tony Walteur | Amaris Consulting | Mantu Group
> **Branch:** `feat/jarvis-integration`
> **Created:** 2026-03-16
> **Approach:** Swarm agents — parallel execution with verification gates

---

## Executive Summary

**Clawbot** has 40+ frontend pages and 540+ backend endpoints across a FastAPI/Python backend.
**Ultron** is a Next.js 16 + TypeScript + SQLite monolith with 46 panels and 150+ API routes.

The 7 core Jarvis panels (Marketing, Analytics, Trading, Voice, Life Manager, Meetings, Marketplace) are **already integrated** into Ultron with working panels, API routes, and database tables.

This plan covers:
1. **Missing Clawbot features** not yet in Ultron
2. **Dead code cleanup** in Ultron
3. **Content enrichment** — panels exist but need richer data/features from Clawbot
4. **Phased rollout** with audit, POC, testing, deployment, and continuous improvement

---

## GAP ANALYSIS: Clawbot Features Missing from Ultron

### TIER 1 — HIGH VALUE (Must Have)

| # | Clawbot Feature | Clawbot Location | Ultron Status | Priority |
|---|----------------|------------------|---------------|----------|
| 1 | **Lead Generation / AI Qualification** | `/app/leadgen/`, `leadgen.py` | Marketing panel has basic leads tab — missing AI qualification, vibe scores, auto-prospect | HIGH |
| 2 | **Outreach / Enterprise Outreach** | `/app/outreach/`, `/app/outreach-enterprise/` | Not in Ultron | HIGH |
| 3 | **Health Tracking** (habits, metrics, goals) | `/app/health/`, `health.py` | Life Manager has habits — missing health metrics (weight, BP, heart rate, steps, sleep, calories, mood) | HIGH |
| 4 | **GSD — Get Stuff Done** (project management) | `/app/gsd/`, `gsd.py` | Not in Ultron (task board exists but no project/phase/wave tracking) | HIGH |
| 5 | **Communications Hub** (multi-channel) | `/app/communications/`, `channels.py` | Channels panel exists — missing Discord/Telegram/WhatsApp/iMessage status dashboard | HIGH |
| 6 | **AI Sales Assistant** | `ai_sales_assistant.py` | Not in Ultron | HIGH |

### TIER 2 — MEDIUM VALUE (Should Have)

| # | Clawbot Feature | Clawbot Location | Ultron Status | Priority |
|---|----------------|------------------|---------------|----------|
| 7 | **Supermemory** (vector search) | `/app/memory/`, `memory.py` | Memory browser exists — missing vector search, document upload/chunking, cloud sync | MEDIUM |
| 8 | **Self-Healer UI** | `/app/healer/`, `healer.py` | Self-healing engine exists in backend — no dedicated panel | MEDIUM |
| 9 | **Knowledge Base** (document repository) | `/app/knowledge/`, `knowledge.py` | Documents panel exists — missing domain classification, sensitivity tags, semantic indexing | MEDIUM |
| 10 | **Orchestrator** (sessions + metrics) | `/app/orchestrator/` | No dedicated orchestrator panel | MEDIUM |
| 11 | **Skillz Marketplace** (skill discovery) | `/app/skillz/`, `skills.py` | Skills panel exists — missing discovery hunter, source aggregation | MEDIUM |
| 12 | **Webhooks v2** (delivery tracking, replay) | `/app/webhooks/` | Webhook panel exists — missing delivery logs, replay, test, stats | MEDIUM |

### TIER 3 — NICE TO HAVE (Could Have)

| # | Clawbot Feature | Clawbot Location | Ultron Status | Priority |
|---|----------------|------------------|---------------|----------|
| 13 | **Billing/Subscription** | `/app/billing/` | Not in Ultron | LOW |
| 14 | **Team Management** | `/app/team/` | User management exists | LOW |
| 15 | **Zapier Integration** | `/app/zapier/` | Not in Ultron | LOW |
| 16 | **Reports** | `/app/reports/` | Analytics covers most | LOW |
| 17 | **Workflows** | `/app/workflows/` | Not in Ultron | LOW |
| 18 | **Orbiter / War Room** | `/app/orbital/` | Not needed (Ultron has own visualization) | LOW |
| 19 | **Email Management** | `/app/email/` | Stub in Clawbot too | LOW |
| 20 | **Prospecting v3** | `/app/prospecting/` | Stub in Clawbot | LOW |

---

## DEAD CODE CLEANUP (Pre-Integration)

### Files to Remove (12 files)
```
src/components/panels/agent-squad-panel.tsx     # Replaced by phase3
src/components/panels/agent-cost-panel.tsx       # Orphaned
src/components/panels/agent-history-panel.tsx     # Orphaned
src/components/panels/documents-panel.tsx         # Orphaned
src/components/chat/chat-input.tsx               # Not imported
src/components/chat/conversation-list.tsx         # Not imported
src/components/chat/message-bubble.tsx            # Not imported
src/components/chat/message-list.tsx              # Not imported
src/components/layout/promo-banner.tsx            # Not imported
src/lib/plugin-loader.ts                          # 0 imports
src/plugins/hyperbrowser-example.ts               # 0 imports
```

### Files to Decompose (Top 5 Priority)
```
agent-detail-tabs.tsx    (2,939 lines → extract into tabs/ subdir)
office-panel.tsx         (2,410 lines → extract sub-components)
task-board-panel.tsx     (2,206 lines → split board + sidebar + modal)
store/index.ts           (1,128 lines → split into domain stores)
nav-rail.tsx             (1,508 lines → extract navigation logic)
```

---

## PHASED IMPLEMENTATION PLAN

### ═══════════════════════════════════════════
### PHASE 0: AUDIT & CLEANUP (Day 1)
### ═══════════════════════════════════════════

**Objective:** Clean foundation before building. Remove dead code, fix duplicates.

#### Tasks (Parallel Swarm — 5 agents)
| Agent | Task | Files |
|-------|------|-------|
| **Agent 0A** | Delete 11 orphaned files | Listed above |
| **Agent 0B** | Remove unused exports from lib/ | `plugin-loader.ts`, `hyperbrowser-example.ts` |
| **Agent 0C** | Verify all existing panels render correctly | All 7 Jarvis panels |
| **Agent 0D** | Run full test suite baseline | `pnpm test` |
| **Agent 0E** | Run typecheck + lint baseline | `pnpm typecheck && pnpm lint` |

#### Gate: ✅ Build passes, all 491+ tests pass, 0 orphaned files

---

### ═══════════════════════════════════════════
### PHASE 1: POC — ENRICH EXISTING PANELS (Day 1-2)
### ═══════════════════════════════════════════

**Objective:** Upgrade the 7 existing Jarvis panels with richer features from Clawbot.

#### 1A. Marketing Panel Enhancement (Parallel — 3 agents)
| Agent | Feature | Source |
|-------|---------|--------|
| **Agent 1A-1** | Add AI lead qualification (vibe score, reasoning) | `leadgen.py` → `marketing/route.ts` |
| **Agent 1A-2** | Add funnel visualization with stage metrics | `/app/leadgen/` |
| **Agent 1A-3** | Add signal confidence scores and source URLs | `leadgen.py` signals endpoint |

#### 1B. Life Manager Enhancement (Parallel — 2 agents)
| Agent | Feature | Source |
|-------|---------|--------|
| **Agent 1B-1** | Add health metrics tracking (weight, BP, heart rate, steps, sleep, mood) | `health.py` |
| **Agent 1B-2** | Add overnight task queue and digest sources | `life.py` overnight tasks |

#### 1C. Trading Panel Enhancement (Parallel — 2 agents)
| Agent | Feature | Source |
|-------|---------|--------|
| **Agent 1C-1** | Add sector allocation pie chart to portfolio | `/app/trading/` |
| **Agent 1C-2** | Add price alert thresholds (above/below) to watchlist | `trading.py` |

#### 1D. Voice Panel Enhancement (1 agent)
| Agent | Feature | Source |
|-------|---------|--------|
| **Agent 1D-1** | Add multi-provider TTS selection (Browser, ElevenLabs, Edge-TTS) | `voice_engine.py` |

#### 1E. Meetings Enhancement (1 agent)
| Agent | Feature | Source |
|-------|---------|--------|
| **Agent 1E-1** | Add transcript upload/processing and key decisions | `/app/meetings/` |

#### 1F. Analytics Enhancement (1 agent)
| Agent | Feature | Source |
|-------|---------|--------|
| **Agent 1F-1** | Add usage heatmaps and user stats tab | `/app/analytics/` |

#### Gate: ✅ All enriched panels render, new API endpoints respond, tests for new features pass

---

### ═══════════════════════════════════════════
### PHASE 2: NEW PANELS — CORE FEATURES (Day 2-3)
### ═══════════════════════════════════════════

**Objective:** Add the 6 Tier-1 missing features as new Ultron panels.

#### 2A. Outreach Panel (Parallel — 3 agents)
| Agent | Task | Deliverable |
|-------|------|-------------|
| **Agent 2A-1** | Create `outreach-panel.tsx` with pipeline visualization | Panel component |
| **Agent 2A-2** | Create `/api/outreach/route.ts` with SQLite tables | API + migration |
| **Agent 2A-3** | Add nav-rail entry + page.tsx routing | Navigation wiring |

#### 2B. Health Panel (Parallel — 3 agents)
| Agent | Task | Deliverable |
|-------|------|-------------|
| **Agent 2B-1** | Create `health-panel.tsx` (dashboard, habits, metrics, goals tabs) | Panel component |
| **Agent 2B-2** | Create `/api/health/route.ts` with metrics schema | API + migration |
| **Agent 2B-3** | Add nav-rail entry + page.tsx routing | Navigation wiring |

#### 2C. GSD Panel (Parallel — 3 agents)
| Agent | Task | Deliverable |
|-------|------|-------------|
| **Agent 2C-1** | Create `gsd-panel.tsx` (projects, phases, tasks, verification) | Panel component |
| **Agent 2C-2** | Create `/api/gsd/route.ts` with project/phase/task tables | API + migration |
| **Agent 2C-3** | Add nav-rail entry + page.tsx routing | Navigation wiring |

#### 2D. Communications Hub Panel (2 agents)
| Agent | Task | Deliverable |
|-------|------|-------------|
| **Agent 2D-1** | Create `communications-panel.tsx` (channel status, message stats) | Panel component |
| **Agent 2D-2** | Create `/api/communications/route.ts` | API endpoint |

#### 2E. Self-Healer Panel (2 agents)
| Agent | Task | Deliverable |
|-------|------|-------------|
| **Agent 2E-1** | Create `healer-panel.tsx` (scan, fix, vacuum, config, events) | Panel component |
| **Agent 2E-2** | Create `/api/healer/route.ts` wiring to self-healing engine | API endpoint |

#### 2F. Sales Assistant Panel (2 agents)
| Agent | Task | Deliverable |
|-------|------|-------------|
| **Agent 2F-1** | Create `sales-assistant-panel.tsx` (briefing, at-risk, email gen) | Panel component |
| **Agent 2F-2** | Create `/api/sales-assistant/route.ts` | API endpoint |

#### Gate: ✅ All 6 new panels render, all API routes respond 200, navigation works, tests pass

---

### ═══════════════════════════════════════════
### PHASE 3: TESTING & DEPLOYMENT (Day 3-4)
### ═══════════════════════════════════════════

**Objective:** Comprehensive testing, build verification, production readiness.

#### 3A. Testing (Parallel Swarm — 6 agents)
| Agent | Task |
|-------|------|
| **Agent 3A-1** | Write unit tests for all new API routes (Vitest) |
| **Agent 3A-2** | Write component tests for new panels |
| **Agent 3A-3** | Write integration tests (API → DB roundtrip) |
| **Agent 3A-4** | Run full test suite (`pnpm test`) — target 80%+ coverage |
| **Agent 3A-5** | Run typecheck (`pnpm typecheck`) — 0 errors |
| **Agent 3A-6** | Run lint (`pnpm lint`) — 0 warnings |

#### 3B. Build Verification (Sequential)
1. `pnpm build` — production build must succeed
2. Verify all static pages generate
3. Start production server on port 3001
4. Smoke test all panels via browser

#### 3C. Deployment Prep
- Verify `.env.example` includes any new env vars
- Update CLAUDE.md with new panels and API routes
- Verify database migrations run cleanly on fresh DB

#### Gate: ✅ 80%+ test coverage, build clean, typecheck clean, lint clean, all panels verified

---

### ═══════════════════════════════════════════
### PHASE 4: FULL DEPLOYMENT (Day 4-5)
### ═══════════════════════════════════════════

**Objective:** Production deployment, monitoring, and final validation.

#### 4A. Production Deployment
1. Merge `feat/jarvis-integration` → `main`
2. Run `pnpm build` on main
3. Start production server: `pnpm start` (port 3001)
4. Verify all 13+ Jarvis panels (7 existing + 6 new) are accessible

#### 4B. Smoke Tests (Parallel — 4 agents)
| Agent | Task |
|-------|------|
| **Agent 4B-1** | E2E test: Navigate all panels, verify content renders |
| **Agent 4B-2** | E2E test: Create/read data in each panel |
| **Agent 4B-3** | Security scan: Verify auth on all new endpoints |
| **Agent 4B-4** | Performance check: Panel load times < 2s |

#### Gate: ✅ All E2E tests pass, no security issues, performance within budget

---

### ═══════════════════════════════════════════
### PHASE 5: CONTINUOUS IMPROVEMENT (Ongoing)
### ═══════════════════════════════════════════

**Objective:** Iterative refinement based on usage data and quality metrics.

#### 5A. Decomposition Sprint (file size compliance)
| Priority | File | Action |
|----------|------|--------|
| 1 | `agent-detail-tabs.tsx` (2,939 lines) | Extract into `agent-detail-tabs/` subdir |
| 2 | `office-panel.tsx` (2,410 lines) | Extract sub-components |
| 3 | `task-board-panel.tsx` (2,206 lines) | Split board + sidebar + modal |
| 4 | `store/index.ts` (1,128 lines) | Split into domain stores |
| 5 | `nav-rail.tsx` (1,508 lines) | Extract navigation data + logic |

#### 5B. Tier 2 Features (Sprint 2)
- Enhanced memory browser with vector search
- Orchestrator panel
- Skill discovery hunter
- Webhook delivery logs + replay

#### 5C. Tier 3 Features (Sprint 3)
- Billing/subscription panel
- Zapier integration
- Workflows panel
- Reports panel

#### 5D. Quality Gates (Every Sprint)
- Test coverage ≥ 80%
- No files > 400 lines (new code)
- Build clean, typecheck clean, lint clean
- All panels render loading + error + empty states
- Security review on all new endpoints

---

## SWARM AGENT ALLOCATION SUMMARY

| Phase | Agents | Duration | Deliverables |
|-------|--------|----------|-------------|
| **Phase 0** | 5 | 2-3 hours | Clean codebase, baseline metrics |
| **Phase 1** | 10 | 4-6 hours | Enriched 7 existing panels |
| **Phase 2** | 15 | 6-8 hours | 6 new panels + APIs + navigation |
| **Phase 3** | 6 | 3-4 hours | Full test suite, build, deploy prep |
| **Phase 4** | 4 | 2-3 hours | Production deployment, E2E validation |
| **Phase 5** | Ongoing | Per sprint | Decomposition, Tier 2/3 features |
| **TOTAL** | **40 agent launches** | **~20 hours** | **13+ Jarvis panels, 12 dead files removed** |

---

## RISK REGISTER

| Risk | Impact | Mitigation |
|------|--------|------------|
| Database migration breaks existing data | HIGH | Use `CREATE TABLE IF NOT EXISTS` pattern (existing convention) |
| New panels break existing ones | HIGH | Test isolation — each panel is independent |
| Nav-rail becomes too crowded | MEDIUM | Use expandable groups (existing pattern) |
| Build size increases significantly | MEDIUM | Lazy-load new panels with `next/dynamic` |
| API route naming conflicts | LOW | Follow existing `/api/{feature}` convention |

---

## SUCCESS CRITERIA

- [ ] All 7 original Jarvis panels enriched with Clawbot features
- [ ] 6 new panels created and working (Outreach, Health, GSD, Communications, Healer, Sales)
- [ ] 12 dead code files removed
- [ ] Build passes with 0 errors
- [ ] 80%+ test coverage
- [ ] TypeScript strict mode — 0 errors
- [ ] All panels have loading + error + empty states
- [ ] Single Ultron instance on port 3001
- [ ] CLAUDE.md updated with new architecture

---

*Generated by Claude Code Swarm Planning — 2026-03-16*
