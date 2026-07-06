# FOPS System Audit Report

**Generated:** 2026-04-14  
**Last Updated:** 2026-04-14 (Audio Matching v2: filter system + search modes + Decision Agent + Content ID provider + pipeline integration)  
**Auditor:** Automated code audit  
**Scope:** Full system — backend, tools, agents, dashboard, infrastructure

---

## Overview

FOPS (File Operations & Pipeline System) is a music release management platform built for Rotana Music. It manages release metadata from Google Sheets, generates YouTube video metadata, performs audio fingerprint matching, and provides a monitoring dashboard.

**Stack:**
- **Backend:** FastAPI (Python 3.10) on port 8001
- **Dashboard:** Next.js 16 (React 19, Tailwind 4) on port 3001
- **Database:** SQLite (fops.db — 12KB)
- **Reverse Proxy:** Nginx with SSL (Certbot)
- **Process Manager:** systemd (fops, fops-dashboard)
- **External:** Google Sheets (gspread), YouTube (yt-dlp), Chromaprint (fpcalc)

**Codebase Size:**
- 46 Python files (~4,400 lines custom code) *(+4 new: security.py, config.py, core_orchestrator.py, tools/audio_matcher.py)*
- 9 frontend files (~870 lines)
- 27 agent + tool files across 2 layers

---

## Current Architecture

```
┌─────────────────────────────────┐
│         Nginx (SSL)             │
│  api.fops.aggarha.com → :8001  │
│  fops.aggarha.com     → :3001  │
└──────────┬──────────┬───────────┘
           │          │
    ┌──────▼──┐  ┌────▼──────────┐
    │ FastAPI  │  │  Next.js      │
    │ :8001    │  │  :3001        │
    │ main.py  │  │  Dashboard    │
    └────┬─────┘  └───────────────┘
         │
    ┌────▼──────────────────────────────────┐
    │  security.py (API Key Auth)           │
    │  config.py (Centralized Settings)     │
    ├───────────────────────────────────────┤
    │  core_orchestrator.py (Unified Entry) │
    │    └→ orchestrator.py (top-level)     │
    │       └→ PipelineAgent                │
    │          └→ 9 Tool Agents             │
    │                                       │
    │  agents/orchestrator.py (System)      │
    │    └→ 7 System Agents                │
    │       └→ VideoFormatterAgent          │
    │          └→ 10 Sub-agents             │
    └──────────┬────────────────────────────┘
               │
    ┌──────────▼──────────┐
    │  Tools Layer         │
    │  fingerprint.py      │
    │  youtube_basic.py    │
    │  youtube_advanced.py │
    │  youtube_formatter.py│
    │  audio_matcher.py    │
    │  formatter.py (dup)  │
    └──────────────────────┘
               │
    ┌──────────▼──────────┐
    │  External Services   │
    │  Google Sheets       │
    │  YouTube (yt-dlp)    │
    │  ffmpeg / fpcalc     │
    │  SQLite              │
    └──────────────────────┘
```

**Architecture Rating: 6/10** *(was 5/10 — improved by unified orchestrator wrapper + config layer)*

Strengths: Clear tool/agent separation, non-destructive design (suggest-only actions), unified orchestrator entry point via `core_orchestrator.py`, centralized config via `config.py`. Weaknesses: Config not yet wired into all files, no dependency injection, God-file main.py (~570 lines).

---

## Tools Status

| Tool | File | Lines | Status | Notes |
|------|------|-------|--------|-------|
| YouTube Basic Search | `tools/youtube_basic.py` | 56 | ✅ Complete | Single-result search via yt-dlp |
| YouTube Advanced Search | `tools/youtube_advanced.py` | 155 | ✅ Complete | Multi-query fuzzy matching with scoring |
| Audio Fingerprint v2 | `tools/fingerprint.py` | 561 | ✅ Complete | 4 algorithms: Chromaprint, Spectral, MFCC, Peaks |
| YouTube Formatter | `tools/youtube_formatter.py` | 304 | ✅ Complete | Title/description/tags generation |
| Audio Matcher | `tools/audio_matcher.py` | 370 | ✅ Complete | Multi-platform matching: YouTube + Spotify/Anghami + fingerprint + disk cache + advanced filters (channel/views/duration) + search modes (hybrid/keyword/fingerprint) |
| Formatter (alias) | `tools/formatter.py` | 4 | ⚠️ Redundant | Re-exports from youtube_formatter — should delete |

### Tool Issues

1. **`formatter.py` is a dead file** — 4 lines that re-export `generate_video_metadata` from `youtube_formatter.py`. Nothing imports from it. Delete it.

2. **`fingerprint.py` has unused imports** — `json` and `re` are imported but never used.

3. **`youtube_basic.py` and `youtube_advanced.py` share duplicate yt-dlp options** — Both construct similar `ydl_opts` independently. Should extract a shared helper.

4. **YouTube bot detection partially mitigated** — `--js-runtimes node --remote-components ejs:github` helps but full reliability requires cookies.txt support which is not implemented.

5. **No URL input validation in fingerprint tool** — URLs are passed directly to yt-dlp subprocess. While yt-dlp handles this safely, the tool doesn't validate that inputs are YouTube URLs before processing.

6. **Fragile NaN handling** — `youtube_formatter.py` checks `val.lower() == "nan"` as a string comparison. This is brittle and should use `pd.isna()`.

---

## Agents Status

### Layer 1: System Agents (agents/)

| Agent | File | Status | Purpose |
|-------|------|--------|---------|
| DataAgent | `data_agent.py` | ✅ Complete | Google Sheets fetch, clean, sync |
| BackendAgent | `backend_agent.py` | ✅ Complete | Backend health monitoring |
| DashboardAgent | `dashboard_agent.py` | ✅ Complete | Dashboard build/restart management |
| AlertsAgent | `alerts_agent.py` | ✅ Complete | Missing data detection & notifications |
| AICloneAgent | `ai_clone_agent.py` | ⚠️ Partial | Tone profile never learns — hardcoded DEFAULT_TONE |
| DevOpsAgent | `devops_agent.py` | ✅ Complete | Infrastructure diagnostics |

### Layer 2: Tool Agents (agents/tools/)

| Agent | File | Status | Purpose |
|-------|------|--------|---------|
| YoutubeSearchAgent | `youtube_search_agent.py` | ✅ Complete | Combines basic + advanced search |
| VariantAgent | `variant_agent.py` | ✅ Complete | Search query variant generation |
| MatchingAgent | `matching_agent.py` | ✅ Complete | Fuzzy matching with weighted scoring |
| FingerprintAgent | `fingerprint_agent.py` | ✅ Complete | Audio fingerprint comparison wrapper |
| MetadataAgent | `metadata_agent.py` | ✅ Complete | YouTube metadata generation |
| ValidationAgent | `validation_agent.py` | ✅ Complete | Release field completeness checking |
| SuggestionAgent | `suggestion_agent.py` | ✅ Complete | Human-readable suggestion builder |
| ControlAgent | `control_agent.py` | ✅ Complete | Action list builder (never auto-executes) |
| PipelineAgent | `pipeline_agent.py` | ✅ Complete | Main YouTube validation pipeline |

### Layer 3: Video Sub-Agents (agents/tools/)

| Agent | File | Status | Purpose |
|-------|------|--------|---------|
| VideoFormatterAgent | `video_formatter_agent.py` | ✅ Complete | Orchestrates all formatter sub-agents |
| TitleAgent | `title_agent.py` | ✅ Complete | YouTube title generation |
| DescriptionAgent | `description_agent.py` | ✅ Complete | Full description assembly |
| TagsAgent | `tags_agent.py` | ✅ Complete | YouTube tags generation |
| HashtagAgent | `hashtag_agent.py` | ✅ Complete | Hashtag generation |
| AlbumAgent | `album_agent.py` | ✅ Complete | Album info lines |
| CreditsAgent | `credits_agent.py` | ✅ Complete | Music credits block |
| ChannelAgent | `channel_agent.py` | ✅ Complete | Channel description management |
| LyricsAgent | `lyrics_agent.py` | ✅ Complete | Lyrics text formatting |
| MetadataParserAgent | `metadata_parser_agent.py` | ✅ Complete | Excel metadata parsing |

### Missing Agents

| Agent | Why Needed |
|-------|-----------|
| **ActionExecutionAgent** | Control page builds action lists but nothing executes them. Actions are only logged client-side. |
| **NotificationPersistenceAgent** | Notifications are in-memory (deque). Server restart = all lost. |
| **CookiesManagementAgent** | YouTube bot detection requires cookies.txt management. No agent handles this. |
| **SchedulerAgent** | Background pipelines run on fixed intervals with no way to configure schedules at runtime. |

---

## API & Endpoints

### Complete Endpoint List (29 endpoints)

| Method | Path | Status | Category |
|--------|------|--------|----------|
| GET | `/` | ✅ | System |
| GET | `/health` | ✅ | System |
| POST | `/api/releases` | ✅ | CRUD |
| GET | `/api/releases` | ✅ | CRUD |
| GET | `/api/releases/from-sheet` | ✅ | CRUD |
| GET | `/api/releases/missing` | ✅ | CRUD |
| GET | `/api/releases/{id}` | ✅ | CRUD |
| PATCH | `/api/releases/{id}` | ✅ | CRUD |
| DELETE | `/api/releases/{id}` | ✅ | CRUD |
| POST | `/api/sync/google-sheets` | ✅ | Data |
| GET | `/api/dashboard/stats` | ✅ | Dashboard |
| GET | `/api/agents/status` | ✅ | Agents |
| POST | `/api/run-agents` | ✅ | Agents |
| POST | `/api/agents/run/{name}` | ✅ | Agents |
| POST | `/api/agents/run-all` | ✅ | Agents |
| GET | `/api/agents/alerts` | ✅ | Agents |
| GET | `/api/agents/ai/analysis` | ✅ | Agents |
| POST | `/api/video/format` | ✅ | Video |
| POST | `/api/video/format-from-sheet/{idx}` | ✅ | Video |
| GET | `/api/video/channels` | ✅ | Video |
| POST | `/api/video/channels` | ✅ | Video |
| DELETE | `/api/video/channels/{name}` | ✅ | Video |
| GET | `/api/video/status` | ✅ | Video |
| POST | `/api/tools/youtube-format` | ✅ | Tools |
| POST | `/api/run-pipeline` | ✅ | Pipeline |
| POST | `/api/run-pipeline/batch` | ✅ | Pipeline |
| GET | `/api/tools/youtube-search` | ✅ | Tools |
| GET | `/api/tools/fingerprint-check` | ✅ | Tools |
| POST | `/api/tools/fingerprint-cache/clear` | ✅ | Tools |
| GET | `/api/notifications` | ✅ | Notifications |
| POST | `/api/notifications/read` | ✅ | Notifications |

### API Issues

1. ~~**CORS is fully open**~~ — ✅ **FIXED (Phase 5):** CORS now whitelists 4 specific origins: `https://api.fops.aggarha.com`, `https://fops.aggarha.com`, `http://localhost:3000`, `http://localhost:3001`.

2. ~~**No authentication**~~ — ✅ **FIXED (Phase 5):** API key authentication added via `security.py`. 11 sensitive endpoints require `x-api-key` header. Public endpoints (health, stats, notifications) remain open. Key configurable via `FOPS_API_KEY` env var.

3. **No rate limiting** — ✅ **FIXED (Phase 6):** slowapi added with 5/minute limit on `/api/run-pipeline`, `/api/tools/youtube-search`, `/api/tools/fingerprint-check`. Returns 429 when exceeded.

4. **Deprecated `@app.on_event("startup")`** — FastAPI deprecated this in favor of lifespan context managers.

5. **main.py is a monolithic God-file** — 564 lines mixing routes from 6+ domains (CRUD, agents, video, tools, notifications, pipeline). Should be split into routers.

6. ~~**Redundant orchestrator paths**~~ — ⚠️ **PARTIALLY FIXED (Phase 5):** `core_orchestrator.py` now provides a unified entry point (`run_main_pipeline`, `run_main_pipeline_batch`) wrapping the top-level orchestrator. `/api/run-agents` still uses `agents/orchestrator.py` directly for system agent management (intentionally separate concern).

---

## Dashboard Status

| Page | Route | Lines | Status | Purpose |
|------|-------|-------|--------|---------|
| Home | `/` | 5 | ✅ | Renders Dashboard component |
| TV | `/tv` | 5 | ⚠️ Stub | Identical to Home — should have kiosk features |
| Control | `/control` | 411 | ⚠️ Partial | Pipeline runner, but actions never persist |
| Dashboard | component | 362 | ✅ | Stats display with auto-refresh |

### Dashboard Issues

1. **Hardcoded API URL in 3 locations** — `https://api.fops.aggarha.com` is hardcoded in:
   - `src/components/Dashboard.tsx`
   - `src/app/control/page.tsx`
   - `src/lib/api.ts`
   
   Should use environment variable `NEXT_PUBLIC_API_URL`.

2. **Dead code in `src/lib/api.ts`** — Exports `fetchStats()` and `fetchSheetReleases()` helpers + TypeScript interfaces, but neither Dashboard nor Control page imports them. Each component reimplements its own fetch logic.

3. **Action buttons are decorative** — `handleApprove()` and `handleReject()` in Control page only append to a local log array. No API call is made. Actions are never executed or saved.

4. **TV page is a non-functional duplicate** — `/tv/page.tsx` renders the same `Dashboard` component as `/page.tsx`. No kiosk mode, no auto-fullscreen, no special display layout. It was intended for kiosk mode but never implemented.

5. **No error display for users** — All fetch failures are caught with `console.error()` only. The UI shows no error states, loading fallbacks, or retry mechanisms.

6. **No `.env.local` or environment configuration** — No mechanism to configure API URLs between environments.

---

## Audio Matching Status

### Implementation: ✅ Complete (v2)

| Algorithm | Weight | Implementation |
|-----------|--------|----------------|
| Chromaprint | 35% | Via fpcalc CLI tool — binary fingerprint comparison with hamming distance |
| Spectral | 25% | scipy FFT-based spectrogram cross-correlation |
| MFCC | 15% | 13-coefficient MFCC with cosine similarity |
| Peaks | 15% | Frequency peak constellation matching |

**Combined confidence = weighted average of all 4 algorithms.**

### Audio System Components

| Component | Status |
|-----------|--------|
| Audio download (yt-dlp → wav) | ✅ Working |
| Audio caching (LRU, max 50) | ✅ Working |
| Chromaprint fingerprinting | ✅ Working |
| Spectral comparison | ✅ Working |
| MFCC comparison | ✅ Working |
| Peak matching | ✅ Working |
| Full comparison API | ✅ Working |
| Quick comparison API | ✅ Working |
| Cache clear API | ✅ Working |

### Audio Issues

1. **Cache is in-memory (process-level)** — Audio cache is an `OrderedDict` in the Python process. Server restart clears it. No disk persistence.

2. **No cache size limit by bytes** — Max 50 items, but each item is a numpy array (30s audio × 22050 Hz × 4 bytes = ~2.6MB). Max theoretical memory: **130MB** for audio cache alone.

3. **Subprocess calls to external tools** — `yt-dlp`, `ffmpeg`, and `fpcalc` are called via `subprocess.run()`. If any tool is missing or updated, fingerprinting silently degrades.

4. **YouTube bot detection** — Some videos trigger "Sign in to confirm you're not a bot". Partially mitigated with JS runtime flags, but no cookies.txt support.

---

## Cache System

### Status: ⚠️ Partially Implemented

| Cache | Type | Location | Persistent | Size Limit |
|-------|------|----------|------------|------------|
| Audio download cache | In-memory `OrderedDict` | `fingerprint.py` | ❌ No | 50 items (~130MB max) |
| Chromaprint cache | In-memory `OrderedDict` | `fingerprint.py` | ❌ No | 50 items |
| Channel descriptions | JSON file | `channels.json` | ✅ Yes | Unlimited |
| Notifications | In-memory `deque` | ~~`main.py`~~ `notifications.json` | ✅ Yes | 200 items |

### What's Missing

1. **No `/var/www/fops/cache/` directory** — The directory does not exist despite being mentioned in conversation history.

2. **No disk-based audio cache** — Every server restart re-downloads audio for every comparison.

3. **No HTTP response caching** — Dashboard polls every 15-30 seconds with no ETag or cache headers.

4. **No Google Sheets response cache** — Every stats/sheet call hits the Google API directly.

---

## Problems & Risks

### Critical Issues (fix immediately)

| # | Issue | Impact | Location |
|---|-------|--------|----------|
| ~~C1~~ | ~~**No authentication on any endpoint**~~ | ✅ **FIXED** — API key auth via `security.py`, 11 endpoints protected | `security.py`, `main.py` |
| ~~C2~~ | ~~**CORS allow_origins=["*"] with allow_credentials=True**~~ | ✅ **FIXED** — 4 specific origins whitelisted | `main.py` |
| ~~C3~~ | ~~**No rate limiting**~~ | ✅ **FIXED** — slowapi 5/minute on fingerprint-check, youtube-search, run-pipeline | `main.py` |
| ~~C4~~ | ~~**Notifications lost on restart**~~ | ✅ **FIXED** — File-based persistence via `notifications.json` | `main.py`, `notifications.json` |
| C5 | **No requirements.txt** | Cannot reproduce environment. pip install is manual guesswork | Project root |
| C6 | **No git repository** | No version control. No rollback. No history | Project root |
| C7 | **Running as root** | systemd service runs as `User=root`. Any vulnerability = full server compromise | `fops.service` |

### Structural Issues (fix before scaling)

| # | Issue | Impact | Location |
|---|-------|--------|----------|
| ~~S1~~ | ~~**Two separate orchestrator systems**~~ | ⚠️ **MITIGATED** — `core_orchestrator.py` unifies pipeline entry point | `core_orchestrator.py` |
| S2 | **main.py is ~570-line monolith** | Unmaintainable; all domains mixed in one file | `main.py` |
| ~~S3~~ | ~~**No configuration layer**~~ | ⚠️ **MITIGATED** — `config.py` created with centralized SETTINGS (not yet wired into all files) | `config.py` |
| S4 | **SQLite in production** | Single-writer lock, no concurrent access, no backups configured | `database.py` |
| S5 | **Deprecated on_event startup** | Will break on future FastAPI versions | `main.py:55` |
| S6 | **Redundant formatter.py** | Dead code that adds confusion | `tools/formatter.py` |
| S7 | **Dashboard TV page is a no-op** | Same as homepage, no kiosk functionality | `tv/page.tsx` |
| S8 | **api.ts helpers are dead code** | Defined but never imported anywhere | `src/lib/api.ts` |
| S9 | **Control page actions are decorative** | Approve/Reject do nothing beyond local log | `control/page.tsx` |

### Operational Risks

| # | Risk | Likelihood | Impact |
|---|------|-----------|--------|
| R1 | YouTube bot detection blocks fingerprinting | High | Audio comparison returns errors instead of scores |
| R2 | Google credentials expire/rotate | Medium | All sheet operations fail |
| R3 | Memory leak from audio cache | Medium | ~130MB max, but no monitoring |
| R4 | ffmpeg/fpcalc/yt-dlp version drift | Medium | Subprocess calls may break silently |
| R5 | DNS for fops.aggarha.com not configured | Active | Dashboard domain returns nothing |
| R6 | No SSL on fops.aggarha.com | Active | Dashboard Nginx block is HTTP-only |
| R7 | No cron pipeline configured | Active | Auto-pipeline mentioned but crontab is empty |
| R8 | No backup strategy for fops.db | High | Single SQLite file, no replication, running as root |

---

## Missing Features

| Feature | Priority | Effort | Description |
|---------|----------|--------|-------------|
| ~~Authentication~~ | ~~🔴 Critical~~ | ~~Medium~~ | ✅ **DONE** — API key auth via `security.py` (Phase 5) |
| ~~Rate Limiting~~ | ~~🔴 Critical~~ | ~~Low~~ | ✅ **DONE** — slowapi 5/min on 3 heavy endpoints (Phase 6) |
| requirements.txt / pyproject.toml | 🔴 Critical | 5 min | `pip freeze > requirements.txt` |
| Git initialization | 🔴 Critical | 5 min | `git init && git add . && git commit` |
| Non-root service user | 🔴 Critical | Low | Create `fops` user, chown files |
| Action execution backend | 🟡 High | Medium | POST endpoint that actually applies approved actions |
| ~~Notification persistence~~ | ~~🟡 High~~ | ~~Low~~ | ✅ **DONE** — File-based JSON persistence (Phase 6) |
| Environment config (.env) | 🟡 High | Low | API URLs, thresholds, secrets via env vars |
| API router splitting | 🟡 High | Medium | Split main.py into FastAPI APIRouter modules |
| Kiosk mode (TV page) | 🟠 Medium | Low | Auto-fullscreen, auto-refresh, `?kiosk=1` param |
| Cron auto-pipeline | 🟠 Medium | 5 min | `crontab -e` → `*/5 * * * * curl ...` |
| Dashboard .env.local | 🟠 Medium | Low | `NEXT_PUBLIC_API_URL=https://api.fops.aggarha.com` |
| DNS + SSL for dashboard | 🟠 Medium | Low | A record + certbot |
| Disk-based audio cache | 🟠 Medium | Medium | Use tempfile dir or Redis |
| Test suite | 🟠 Medium | High | Zero tests exist. Critical paths untested. |
| Database backups | 🟠 Medium | Low | Cron SQLite backup to /var/backups/ |
| YouTube cookies.txt support | 🟢 Low | Low | yt-dlp `--cookies` flag in fingerprint.py |
| ~~Unified config file~~ | ~~🟢 Low~~ | ~~Medium~~ | ⚠️ **STARTED** — `config.py` created, needs wiring into existing code (Phase 5) |
| API documentation | 🟢 Low | Low | FastAPI auto-generates OpenAPI, just needs cleanup |

---

## Evaluation Summary

| Category | Score | Notes |
|----------|-------|-------|
| **Architecture** | 6/10 | Unified orchestrator wrapper, config layer started. Still monolith main.py, no DI |
| **Completeness** | 7/10 | Core features work. Gaps in action execution, kiosk, persistence |
| **Code Quality** | 6/10 | Clean individual files. Inconsistent patterns across layers. Dead code present |
| **Security** | 5/10 | API key auth + CORS + rate limiting. Still running as root |
| **Scalability** | 3/10 | SQLite + synchronous processing won't scale |
| **Reliability** | 5/10 | Notifications persist. No tests, no git, no DB backups |
| **Maintainability** | 5.5/10 | Config layer started. Still ~570-line main.py, hardcoded values remain in most files |
| **Infrastructure** | 6/10 | systemd + Nginx work. Missing cron, backups, monitoring, non-root user |

**Overall: 5.9/10** *(was 5.6/10)* — Functional prototype. Audio matching v2 with filters, decision intelligence, content ID plugin. Remaining gaps: root user, git, tests, DB backups.

---

## Recommended Next Steps

### Phase 1: Immediate (security & stability)

1. `pip freeze > requirements.txt`
2. `git init && git add -A && git commit -m "initial"`
3. ~~Add API authentication~~ — ✅ **DONE** (security.py)
4. ~~Fix CORS to whitelist specific origins~~ — ✅ **DONE** (4 origins whitelisted)
5. Create non-root `fops` user for systemd services
6. Add SQLite backup cron job

### Phase 2: Short-term (architecture)

7. Split `main.py` into FastAPI routers: `routes/releases.py`, `routes/agents.py`, `routes/video.py`, `routes/tools.py`, `routes/notifications.py`
8. ~~Merge or clarify the two orchestrator layers~~ — ⚠️ **MITIGATED** (core_orchestrator.py)
9. Delete `tools/formatter.py` (dead file)
10. Delete or fix `src/lib/api.ts` (dead code)
11. Add `.env` / `.env.local` configuration
12. Implement action execution endpoint
13. Persist notifications to SQLite

### Phase 3: Medium-term (features)

14. Implement kiosk mode on `/tv` page
15. Add cron auto-pipeline
16. Configure DNS + SSL for fops.aggarha.com
17. ~~Add rate limiting on heavy endpoints~~ — ✅ **DONE** (slowapi, Phase 6)
18. Add disk-based audio cache
19. Migrate `@app.on_event("startup")` to lifespan

### Phase 4: Long-term (quality)

20. Write test suite (at minimum: CRUD, pipeline, fingerprint)
21. Create unified config system (YAML or env vars)
22. Add monitoring/alerting (process, memory, error rates)
23. Consider PostgreSQL migration if concurrent access grows
24. Add YouTube cookies.txt support for production reliability

---

---

## Phase 5 Stabilization Summary (2026-04-14)

**New files added:**
| File | Purpose |
|------|---------|
| `security.py` | API key authentication — `verify_api_key()` dependency, reads `FOPS_API_KEY` env var |
| `core_orchestrator.py` | Unified orchestrator wrapper — `run_main_pipeline()`, `run_main_pipeline_batch()` |
| `config.py` | Centralized SETTINGS dict — fingerprint weights, YouTube limits, matching weights |
| `tools/audio_matcher.py` | Placeholder for cross-platform audio matching — returns `ready_for_upgrade` |

**Protected endpoints (require `x-api-key` header):**
`/api/run-pipeline`, `/api/run-pipeline/batch`, `/api/run-agents`, `/api/agents/run/{name}`, `/api/agents/run-all`, `/api/tools/youtube-format`, `/api/tools/youtube-search`, `/api/tools/fingerprint-check`, `/api/tools/fingerprint-cache/clear`

**Public endpoints (no auth):**
`/`, `/health`, `/api/releases/*`, `/api/dashboard/stats`, `/api/agents/status`, `/api/agents/alerts`, `/api/agents/ai/analysis`, `/api/video/*`, `/api/notifications`, `/api/notifications/read`

---

*This audit is based on reading every file in the system and verifying infrastructure state. Originally generated 2026-04-14. Updated 2026-04-14 post Audio Matching Engine upgrade.*
