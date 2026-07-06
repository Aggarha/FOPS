# FOPS Platform — Status Report
**Generated:** 2026-05-17  
**Platform:** https://fops.aggarha.com

---

## Infrastructure

| Component | Details |
|---|---|
| **Server** | Ubuntu root@ubuntu-4gb-hel1-2 |
| **Backend** | FastAPI + uvicorn, port 8001, `/var/www/fops` |
| **Frontend** | Next.js 16.2.1 Turbopack, port 3001, `/var/www/fops-dashboard` |
| **Database** | SQLite `/var/www/fops/fops.db` (releases), `/var/www/fops/storage/users.db` (auth) |
| **Venv** | `/var/www/fops/venv` (Python 3.10) |
| **Process Manager** | PM2 — `fops-backend` (id:0), `fops-frontend` (id:1) |
| **Reverse Proxy** | nginx SSL (Let's Encrypt) → HTTPS:3001, `/api/` → 8001 |
| **Boot persistence** | `pm2-root.service` systemd enabled — survives reboots |

### PM2 Commands
```bash
pm2 list
pm2 restart fops-backend
pm2 restart fops-frontend
pm2 logs fops-backend --lines 50
pm2 logs fops-frontend --lines 50
```

---

## Frontend — 25 Routes

| Route | File size | Purpose |
|---|---|---|
| `/` | — | Redirect → /dashboard |
| `/login` | 166L | JWT authentication |
| `/dashboard` | 350L | Analytics (releases, charts, KPIs) |
| `/tv` | 149L | TV broadcast mode |
| `/kiosk` | 249L | Kiosk display mode |
| `/control` | 380L | System control panel |
| `/communications` | 161L | Internal communications |
| `/settings` | 300L | Config & preferences |
| `/logs` | 18L | Log history (uses LiveLogs component) |
| `/operations/live-logs` | 387L | Real-time WebSocket log stream |
| `/tools` | 132L | Tools index grid |
| `/tools/youtube-search` | 625L | Discovery Engine (single + batch + Excel) |
| `/tools/channel-scrape` | 341L | YouTube channel crawler |
| `/tools/fingerprint-db` | 247L | Audio fingerprint compare + generate |
| `/tools/audio-match` | 890L | Audio matching tool |
| `/tools/publishing` | 56L | Publishing workflow (CreditsFormatter + DescriptionBuilder) |
| `/tools/publishing-hub` | 5L | CategoryDashboard: publishing |
| `/tools/monitoring` | 5L | CategoryDashboard: monitoring |
| `/tools/operations` | 5L | CategoryDashboard: operations |
| `/tools/protection` | 5L | CategoryDashboard: protection |
| `/tools/audit` | 312L | Audit log viewer (filter by level/category/tool) |
| `/tools/notifications` | 249L | Notifications centre (read/unread) |
| `/tools/timeline` | 302L | Release timeline tracker |
| `/tools/users` | 463L | User management CRUD (admin only) |
| `/_not-found` | — | 404 handler |

**Build:** 25/25 routes, 0 TypeScript errors ✅

### Stub Pages (use CategoryDashboard component)
`/tools/publishing-hub`, `/tools/monitoring`, `/tools/operations`, `/tools/protection` — render the tools-config tool grid for their category.

---

## Backend — API Endpoints

### Auth
| Method | Path | Auth |
|---|---|---|
| POST | `/api/login` | public |
| GET | `/api/auth/me` | JWT |

### Releases
| Method | Path | Auth |
|---|---|---|
| GET | `/api/releases` | — |
| GET | `/api/releases/{id}` | — |
| POST | `/api/releases` | — |
| PATCH | `/api/releases/{id}` | — |
| DELETE | `/api/releases/{id}` | — |
| POST | `/api/sync/google-sheets` | JWT |
| GET | `/api/dashboard/stats` | JWT |
| GET | `/api/dashboard/overview` | JWT |
| GET | `/api/dashboard/today` | JWT |
| GET | `/api/dashboard/next` | JWT |

### Tools (all require JWT + tool permission)
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/tools/discover` | YouTube discovery single |
| POST | `/api/tools/discover/batch` | Batch discovery |
| POST | `/api/tools/scrape/channel` | Channel scraper |
| POST | `/api/tools/fingerprint/compare-audio` | Fingerprint compare |
| POST | `/api/tools/fingerprint/generate` | Generate fingerprint |
| POST | `/api/tools/batch/parse-upload` | Parse Excel/CSV |
| POST | `/api/tools/batch/export-xlsx` | Export XLSX |
| POST | `/api/tools/youtube-format` | Format YouTube metadata |
| POST | `/api/tools/audio-match` | Audio match |
| POST | `/api/tools/audio-match/batch` | Batch audio match |
| GET | `/api/tools/youtube-search` | YouTube search |
| GET | `/api/tools/fingerprint-check` | Fingerprint check |
| POST | `/api/tools/channel-scrape` | Channel scrape |

### Logs
| Method | Path | Auth |
|---|---|---|
| GET | `/api/logs` | JWT |
| GET | `/api/logs/stats/summary` | JWT |
| GET | `/api/logs/tools/{tool_name}` | JWT |
| GET | `/api/logs/{log_id}` | JWT |
| POST | `/api/logs/export` | JWT |
| **WS** | `/api/ws/logs` | optional `?token=jwt` |

### Notifications
| Method | Path |
|---|---|
| GET | `/api/notifications` |
| POST | `/api/notifications/add` |
| POST | `/api/notifications/read/{id}` |
| POST | `/api/notifications/read-all` |
| DELETE | `/api/notifications/{id}` |

### Users (require `can_manage_users` permission)
| Method | Path |
|---|---|
| GET | `/api/users` |
| POST | `/api/users` |
| PATCH | `/api/users/{user_id}` |
| DELETE | `/api/users/{user_id}` |

### Agents & Pipeline
| Method | Path |
|---|---|
| GET | `/api/agents/status` |
| POST | `/api/run-agents` |
| POST | `/api/agents/run/{agent_name}` |
| POST | `/api/agents/run-all` |
| POST | `/api/run-pipeline` |
| POST | `/api/run-pipeline/batch` |

### Settings & Video
| Method | Path |
|---|---|
| GET | `/api/settings` |
| POST | `/api/settings` |
| POST | `/api/video/format` |
| GET | `/api/video/channels` |
| GET | `/api/video/status` |
| GET | `/api/tv/releases` |

---

## Backend Services

| Service | File | Purpose |
|---|---|---|
| Discovery Engine | `services/discovery_engine.py` | 12 YouTube query variants, parallel ThreadPoolExecutor, confidence 0-100, canonical detection |
| Fingerprint Comparison | `services/fingerprint_comparison_service.py` | chromaprint 35% + spectral 30% + MFCC 25% + peaks 10%, LRU cache 30 entries |
| Batch Processor | `services/batch_processor.py` | Excel/CSV parse with Arabic column aliases, XLSX export neon theme |
| Channel Scraper | `tools/channel_scraper.py` | @handle/UCxxx/URL/bare name, unlimited, /videos+/shorts+/streams |
| Activity Logger | `services/activity_logger.py` | Logs all tool usage to SQLite ActivityLog table |
| WebSocket Broadcaster | `services/websocket_broadcaster.py` | Real-time broadcast to connected WS clients |
| Credits Router | `routes/credits.py` | `/api/credits/*` — format, normalize, transliterate |
| Notifications | `notifications_simple.py` | In-memory per-user notification store |

---

## WebSocket

| Property | Value |
|---|---|
| **Production URL** | `wss://fops.aggarha.com/api/ws/logs` |
| **Local URL** | `ws://localhost:8001/api/ws/logs` |
| **Auth** | Optional `?token=<jwt>` |
| **Library** | `websockets==16.0` in venv |
| **Handler** | `_ws_logs_standalone()` in `main.py` ~line 229 |
| **nginx** | `/api/` location has `Upgrade` + `Connection: upgrade` ✅ |

**Root cause of original bug:** `websockets` library missing from venv (silent 404). Secondary: `@router.websocket("/ws")` shadowed by `@router.get("/{log_id}")` HTTP route. Fixed with standalone `@app.websocket("/api/ws/logs")`.

---

## Auth & Users

| Field | Value |
|---|---|
| Default admin | `admin@fops.local` / `admin123` |
| Roles | `admin`, `analyst`, `operator`, `viewer` |
| Token storage | `localStorage.access_token` (JWT Bearer) |
| Token refresh | `localStorage.refresh_token` |

### Role Permissions
| Role | Categories | Special |
|---|---|---|
| admin | all | can_manage_users, all tools |
| analyst | protection, monitoring, operations | most tools |
| operator | protection, monitoring | tool subset |
| viewer | monitoring only | read-only |

---

## Key Files

| File | Purpose |
|---|---|
| `/var/www/fops/main.py` | FastAPI app (1848+ lines) — all routes, middleware, auth |
| `/var/www/fops/ecosystem.config.js` | PM2 config for both services |
| `/var/www/fops/routes/tools.py` | Tools router (prefix `/api/tools` built-in, NO extra prefix in include_router) |
| `/var/www/fops/routes/logs.py` | Logs REST router (prefix `/api/logs`) |
| `/var/www/fops/routes/credits.py` | Credits formatter router |
| `/var/www/fops/services/` | All service modules |
| `/var/www/fops/storage/users.py` | SQLAlchemy User/Permission/AuditLog models |
| `/var/www/fops-dashboard/src/lib/api.ts` | Frontend API client (454L) |
| `/var/www/fops-dashboard/src/lib/tools-config.ts` | Tool registry + RBAC config |
| `/etc/nginx/sites-available/fops.aggarha.com` | nginx SSL + proxy config |

---

## ⚠️ Critical Notes

1. **Route prefix**: `tools_router` has `prefix="/api/tools"` built-in. `main.py` `include_router` has **NO** extra prefix — do NOT add one (causes double-prefix 404s).

2. **WebSocket library**: `websockets` must stay installed in venv. If removed, all WS connections silently return 404.

3. **Old Docker process**: Next.js v14 runs from `/app` on port 3000. It is a **separate project**, NOT FOPS. Leave it alone.

4. **PM2 save**: After any PM2 config change, run `pm2 save` to persist across reboots.

---

*Last updated: 2026-05-17*
