# Stratum

Stratum is watchlist intelligence for a finite list of target companies.  
It monitors supported ATS sources, saves point-in-time briefs, compares each refresh to the previous saved brief, and keeps meaningful changes in an in-app inbox.

## Project Summary

- User enters a company name or source query in the UI.
- Backend fetches open roles from supported ATS APIs and normalizes the target identity.
- The system creates a point-in-time watchlist brief with:
  - evidence-backed `strategicVerdict`
  - deterministic `engineeringVsSalesRatio`
  - `summary`
  - proof roles
  - source coverage and caveats
- Watchlists preserve the latest saved brief, the previous saved brief, and repeatable change summaries.
- Meaningful changes stay in the in-app notification inbox.

## Problem Solved

Target-company hiring signals are easy to miss between spot checks, and manual ATS review is hard to compare over time.  
Stratum turns those checks into saved briefs and repeatable change records.

## Features

- Tenant-scoped accounts via Google sign-in (NextAuth), with `owner`/`analyst`/`viewer` workspace roles
- Viewer role gets read-only access: write controls (track, refresh, remove, schedule, create watchlist) are hidden in the UI and rejected with 403 by the API
- Target-company watchlists with manual and scheduled refreshes
- Point-in-time saved briefs with latest-vs-previous comparison
- In-app notification inbox for meaningful monitoring changes
- Evidence-backed brief view with proof roles, source coverage, and caveats
- Multi-source job board fetch with priority/fallback logic:
  - Greenhouse
  - Lever
  - Ashby
  - Workable
- Company alias and fallback token handling (for known slug mismatches)
- Deterministic engineering vs sales ratio calculation (not AI-generated)
- Brief generation through Google Gemini (`gemini-3-flash-preview`) with JSON parsing/normalization
- In-memory cache with configurable TTL (`STRATUM_CACHE_TTL_HOURS`, default 24h)
- Per-IP rate limiting (5 requests/minute, sliding window)
- Retry logic for network/timeout failures on outbound ATS calls
- Error handling UX:
  - rate-limit handling (429)
  - service interruption modal
  - empty result state for unsupported/no-board companies
- Optional MCP server (`npm run mcp`) with `analyze_company` tool over stdio

## Tech Stack

- Framework: Next.js 16 (App Router)
- UI: React 19 + TypeScript
- Styling: Tailwind CSS 4
- Auth: NextAuth v5 (Google provider), tenant-scoped sessions
- Database: PostgreSQL via `drizzle-orm` / `drizzle-kit`
- AI: `@google/genai`
- Tool protocol: `@modelcontextprotocol/sdk` + `zod`
- Utility libs used in source: `clsx`, `tailwind-merge`, `lucide-react`, `dotenv` (MCP boot)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env.local
```

Required for production/runtime:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/stratum
AUTH_SECRET=replace_me_with_a_long_random_secret
AUTH_GOOGLE_ID=replace_me_with_google_client_id
AUTH_GOOGLE_SECRET=replace_me_with_google_client_secret
```

Optional:

```env
NEXT_PUBLIC_SITE_URL=https://your-domain.example
GEMINI_API_KEY=your_key
STRATUM_CACHE_TTL_HOURS=24
CRON_SECRET=your_cron_secret
STRATUM_SCHEDULED_CRON_SECRET=your_cron_secret
```

3. Run database migrations:

```bash
npm run db:migrate
```

4. Run the app:

```bash
npm run dev
```

5. Production commands:

```bash
npm run build
npm run start
```

6. Optional MCP server:

```bash
npm run mcp
```

## Development and Verification Commands

```bash
npx tsc --noEmit     # type check
npx eslint .         # lint (also available as npm run lint)
npm run test:e2e     # Playwright e2e suite (requires local pglite/test-route setup; not run in normal review passes)
```

## Project Structure

```text
src/
  app/
    page.tsx                         # redirects to /watchlists
    (workspace)/watchlists/page.tsx  # primary watchlist console (server component)
    (workspace)/briefs/[briefId]/    # saved brief view
    (workspace)/notifications/       # in-app notification inbox
    (dossier)/watchlists/[watchlistId]/entries/[entryId]/  # single-entry detail page
    api/analyze-unified/route.ts     # company check endpoint (used by watchlist refreshes)
    api/watchlists/                  # create watchlist, track/remove/update entries, intake resolve
    api/cron/scheduled-refreshes/    # Vercel Cron entry point for automated refreshes
    api/scheduled-refreshes/run/     # manual/non-Vercel trigger for due refreshes
    api/notifications/               # notification list/read/unread-count
    api/auth/[...nextauth]/          # NextAuth session routes
    api/test/e2e/                    # test-only routes, gated by STRATUM_ENABLE_TEST_ROUTES
  components/
    watchlist/                       # WatchlistConsole, sidebar, signal inbox, entry detail page
    notifications/                   # notification inbox link + console
    shell/AppShell.tsx               # nav shell used by the (workspace) and (dossier) layouts
    ui/                              # button, dialog, drawer, input, toast, shared UI components
  lib/
    auth/session.ts                  # session loading + canWriteWorkspace role gate
    watchlists/                      # repository, automation/cron status, scheduled refresh runner
    ai/unified-analyzer.ts           # Gemini prompt, call, response parsing
    api/                             # Greenhouse/Lever/Ashby/Workable adapters + retry
    cache/stratum-cache.ts           # in-memory TTL cache
    security/RateLimiter.ts          # per-IP rate limiter
    services/StratumInvestigator.ts  # orchestration layer
    gemini.ts                        # Gemini client bootstrap
  mcp-server.ts                      # MCP stdio server
scripts/
  test-new-boards.ts                 # ATS integration smoke script
  probe-company-slug.ts              # slug discovery helper
  prepare-e2e-db.mjs                 # local pglite bootstrap for Playwright runs
  run-playwright-e2e.mjs             # `npm run test:e2e` entry point
  verify-access-control.ts           # manual viewer/owner permission check script
```

## Architecture Overview

### Watchlist flow (primary product surface)

1. The signed-in user tracks a company from the watchlist console (`WatchlistConsole`), which resolves the input through `/api/watchlists/resolve` and creates an entry via `POST /api/watchlists/[watchlistId]/entries`.
2. Tracking (and every later refresh) calls `/api/analyze-unified`, which fetches jobs from supported ATS sources, computes the deterministic eng:sales ratio, and runs Gemini analysis when jobs exist.
3. Each check saves a point-in-time brief and updates the entry's latest-vs-previous comparison; meaningful changes are written to the in-app notification inbox.
4. Scheduled entries are refreshed automatically by `GET /api/cron/scheduled-refreshes`, invoked by Vercel Cron on the schedule in `vercel.json` (hourly). The route only accepts requests authenticated with `CRON_SECRET`/`STRATUM_SCHEDULED_CRON_SECRET` or, on Vercel infrastructure, the platform's `x-vercel-cron` header. `/api/scheduled-refreshes/run` exists for manually triggering due refreshes outside of Vercel Cron.
5. Server-derived `canWriteWorkspace(session.role)` (`src/lib/auth/session.ts`) gates all write actions both server-side (API routes return 403 for viewers) and in the UI (write controls are hidden/disabled for viewer-role sessions).

### MCP flow

1. `src/mcp-server.ts` starts stdio MCP transport.
2. Tool `analyze_company` invokes `StratumInvestigator`.
3. Tool returns JSON result as text content.

## Deployment and Runtime Notes (Confirmed)

- This is a standard Next.js app with `dev`, `build`, and `start` scripts.
- Production runtime requires `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET`.
- `NEXT_PUBLIC_SITE_URL` is optional for boot but should be set for correct canonical metadata.
- `GEMINI_API_KEY` is optional; when unset, AI analysis is disabled and the rest of the product still boots.
- Scheduled refresh cron authorization accepts `CRON_SECRET` or `STRATUM_SCHEDULED_CRON_SECRET`; in Vercel cron deployments it can also use the platform cron header.
- Test-only routes and preview inbox data are gated behind `STRATUM_ENABLE_TEST_ROUTES=1` or `STRATUM_E2E_MODE=1` and local-host checks.
- Local E2E verification uses `STRATUM_DB_DRIVER=pglite`, `STRATUM_PGLITE_DATA_DIR`, and `AUTH_TRUST_HOST=1`; those are test harness settings, not production requirements.
- Security headers are configured in `next.config.ts`:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- The app includes watchlist, brief, notification, and scheduled-refresh routes in addition to `/api/analyze-unified`.
- A `vercel.json` deployment manifest is present in the repository.
- [Partially inferred] Hosting target is not fixed by code; docs mention platforms like Vercel/Railway as options.

## Limitations

- Coverage is limited to companies discoverable through the implemented ATS APIs and token mapping logic.
- The brief-generation cache is in-memory and resets on process restart, even though watchlists, briefs, and notifications are persisted.
- `package.json` defines `generate:sentinel`, but `scripts/generate_sentinel.ts` is not present in the repo.
- Test-only routes should not be enabled in production; the repo gates them on explicit flags (`STRATUM_ENABLE_TEST_ROUTES`, `STRATUM_E2E_MODE`) plus local-host checks, but deployment hygiene still matters.

## Partial Inference Index

- "Hosting target is not fixed by code; docs mention platforms like Vercel/Railway as options."
