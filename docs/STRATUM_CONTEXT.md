# Stratum – Full context for new chat

**What Stratum is**  
Stratum is a "Growth Intelligence" web app that analyzes company hiring strategy from public job boards. User enters a company name → system fetches open jobs → AI turns them into a verdict, metrics, and highlights. Positioned as a portfolio/grant piece and "Growth Intelligence for Agents," not as broad "Corporate Intelligence" (no Workday/big tech).

**APIs in use**  
- **Greenhouse** – `https://boards-api.greenhouse.io/v1/boards/{token}/jobs` (primary).  
- **Lever** – `https://api.lever.co/v0/postings/{site}?mode=json` (fallback on Greenhouse 404).  
- **Google Gemini** – `gemini-3-flash-preview` for analysis (hiring velocity, strategic verdict, Eng:Sales ratio, keyword findings, notable roles, summary).

**Core flow**  
1. User types company → `POST /api/analyze-unified` with `{ companyName }`.  
2. `boards.ts`: normalize name → try Greenhouse token (with alias/fallback), then Lever.  
3. If 0 jobs: skip AI, return "No job board found for X on Greenhouse or Lever. Try another company (e.g. Airbnb, Stripe)."  
4. If jobs: `StratumInvestigator` → `runStratumAnalysis` (Gemini) → cache (24h in-memory) → return result.  
5. UI: TruthConsole (search, Bento layout: company + verdict, summary, Strategic Signals, Highlights, Hiring Velocity bar, Eng:Sales, Open Roles). Footer: "Data from Greenhouse & Lever" and coverage note.

**Aliases / fallbacks**  
- Aliases: `grok`/`x.ai` → `xai`, `twitter` → `x`.  
- Fallback tokens when primary 404s (e.g. `twitter` → try `x`).  
- No `KNOWN_UNSUPPORTED` list; one message for all 0-job cases.

**Security & robustness**  
- Input: company name required, max 100 chars, strip `<>"'`.  
- Rate limit: 5 req/min per IP (429 + Retry-After).  
- Security headers: X-Content-Type-Options, X-Frame-Options, Referrer-Policy.  
- Fetch retries (timeout/network), no AI call when 0 jobs.

**UI/UX**  
- Empty state: "Use the search bar above…", "Or try one:" with clickable Airbnb, Stripe, XAI.  
- Label "Type company name here" above search when no result.  
- Loading: REVEAL shows "Analyzing…", AnalysisSkeleton for main area.  
- Result: company name (accent, bold), left accent bar, verdict, summary; "Matched as: X" when alias used; "Cached" badge when cached.  
- "New search" button; Eng:Sales tooltip ("Engineering vs Sales ratio — e.g. 2:1 means 2 engineers per 1 sales role").  
- Error: ServiceInterruptionModal (network/500); 429 shows "Rate Limit" with message.  
- Footer: data source + "Apple, Google, Microsoft use different systems" when no result.

**The Purge (Veritas/crypto removed)**  
Removed: `dexscreener`, `pumpfun`, `market`, `scraper`, `screenshot`, `solscan`, `solana`, `db/elephant`, `db/mongodb`, `ai/analyst`, `app/actions/sherlock`, dashboard (Scanner, UnifiedResultCard), `useScanner`, `useScanHistory`, CryptoLoader, TerminalLogLoader, ThinkingStep. Types stripped to Stratum-only. Repo is Stratum-only; build passes.

**Key files**  
- `src/app/api/analyze-unified/route.ts` – API entry, validation, cache check, rate limit.  
- `src/lib/api/boards.ts` – Greenhouse/Lever fetch, aliases, fallbacks.  
- `src/lib/services/StratumInvestigator.ts` – fetch → 0-job early return or AI → result.  
- `src/lib/ai/unified-analyzer.ts` – Gemini prompt and JSON parsing.  
- `src/lib/cache/stratum-cache.ts` – in-memory cache, 24h TTL, `STRATUM_CACHE_TTL_HOURS`.  
- `src/lib/security/RateLimiter.ts` – 5/min per IP.  
- `src/components/truth/TruthConsole.tsx` – main UI.  
- `src/mcp-server.ts` – MCP tool `analyze_company` for agents.  
- `.env.example` – `GEMINI_API_KEY`, optional `STRATUM_CACHE_TTL_HOURS`.

**Limitations**  
- Only Greenhouse + Lever; no Apple, Google, Microsoft, Amazon, etc. (they use other ATS).  
- In-memory cache (resets on restart).  
- No persistent DB, no auth.

**Decisions made**  
- One generic message for all 0-job cases; no maintained "known unsupported" list.  
- Skip AI when 0 jobs (cost and clarity).  
- Be explicit: "Data from Greenhouse & Lever" and coverage note in footer.  
- Repo cleaned of Veritas/crypto; positioned as "Growth Intelligence" / "Tech Sector Radar."

**Current state**  
- Build: `npm run build` succeeds.  
- Pushed to GitHub (initial commit).  
- Next: record demo (Stripe, Airbnb, XAI), submit to Context Protocol, optional founder DMs.

**Env**  
- Required: `GEMINI_API_KEY`.  
- Optional: `STRATUM_CACHE_TTL_HOURS` (default 24).  
- `NEXT_PUBLIC_SITE_URL` for metadata (optional).
