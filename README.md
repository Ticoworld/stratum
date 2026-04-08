# Stratum

Stratum is a Next.js application that analyzes company hiring strategy from public job board data.  
The repository also includes an MCP server exposing the same analysis as a tool (`analyze_company`).

## Project Summary

- User enters a company name in the UI.
- Backend fetches open roles from supported ATS APIs (Greenhouse, Lever, Ashby, Workable).
- The system derives structured strategy outputs:
  - `strategicVerdict`
  - `hiringVelocity`
  - deterministic `engineeringVsSalesRatio`
  - `keywordFindings`
  - `notableRoles`
  - `summary`

## Problem Solved

Public job postings are noisy and hard to interpret quickly.  
Stratum converts posting data into a compact strategic readout so users can infer hiring direction from one request.

## Features

- Unified analysis API route: `POST /api/analyze-unified`
- Multi-source job board fetch with priority/fallback logic:
  - Greenhouse
  - Lever
  - Ashby
  - Workable
- Company alias and fallback token handling (for known slug mismatches)
- Deterministic engineering vs sales ratio calculation (not AI-generated)
- AI analysis through Google Gemini (`gemini-3-flash-preview`) with JSON parsing/normalization
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

Minimum required:

```env
GEMINI_API_KEY=your_key
```

Optional:

```env
STRATUM_CACHE_TTL_HOURS=24
NEXT_PUBLIC_SITE_URL=https://your-domain.example
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
- Security headers are configured in `next.config.ts`:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- The only app API route in the current codebase is `/api/analyze-unified`.
- A `vercel.json` deployment manifest is present in the repository.
- [Partially inferred] Hosting target is not fixed by code; docs mention platforms like Vercel/Railway as options.

## Limitations

- Coverage is limited to companies discoverable through the implemented ATS APIs and token mapping logic.
- No persistent cache/database is wired into the active request path; cache is in-memory and resets on process restart.
- No authentication/authorization layer is present in the analysis API route.
- `scripts/list_models.js` currently contains a hardcoded API key and fails lint under current ESLint rules.
- `package.json` defines `generate:sentinel`, but `scripts/generate_sentinel.ts` is not present.

## Partial Inference Index

- "Hosting target is not fixed by code; docs mention platforms like Vercel/Railway as options."
