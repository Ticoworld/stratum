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

3. Run the app:

```bash
npm run dev
```

4. Production commands:

```bash
npm run build
npm run start
```

5. Optional MCP server:

```bash
npm run mcp
```

## Project Structure

```text
src/
  app/
    api/analyze-unified/route.ts     # main analysis endpoint
    globals.css
    layout.tsx
    page.tsx                         # renders TruthConsole
  components/
    truth/TruthConsole.tsx           # primary UI and user flow
    ui/                              # status bar, modal, skeleton, shared UI components
  lib/
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
  list_models.js                     # local model-list script
```

## Architecture Overview

### Web request flow

1. UI submits company name to `/api/analyze-unified`.
2. API applies IP rate limit and input validation/sanitization.
3. API checks in-memory cache.
4. On cache miss, `StratumInvestigator`:
   - fetches jobs from ATS sources via `fetchCompanyJobs`
   - returns an explicit no-jobs result if none found
   - computes deterministic eng:sales ratio
   - runs Gemini analysis if jobs exist
5. API returns normalized JSON payload for UI rendering.

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
- `scripts/list_models.js` currently contains a hardcoded API key and fails lint under current ESLint rules.
- `package.json` defines `generate:sentinel`, but `scripts/generate_sentinel.ts` is not present.
- Test-only routes should not be enabled in production; the repo now gates them on explicit flags plus local-host checks, but deployment hygiene still matters.

## Partial Inference Index

- "Hosting target is not fixed by code; docs mention platforms like Vercel/Railway as options."
