# Codebase Audit

This file preserves the completed Stratum audit and forensic validation pass. It captures the audit truth of the original product path before the approved migration work began.

Important context:
- The audit targeted the legacy live ATS-to-LLM dashboard architecture.
- Phase 1 later removed `scripts/list_models.js` and added infrastructure foundation, but Phase 1 did not change the audited product truth of the live dashboard path.
- Treat this file as the historical and architectural baseline that justified the migration blueprint.

## Executive verdict
Verified: Stratum was a live ATS-to-LLM dashboard demo. It fetched current ATS job postings, reduced them to a shallow normalized shape, asked Gemini for a strategic summary, and rendered one transient result screen.

Verified: It was not a certified or enterprise-grade corporate intelligence system. It had no durable report store, no raw payload archive, no immutable snapshots, no report versioning, no PDF generation, no evidence chain, no audit log, and no point-in-time replay.

Verified evidence included:
- `src/app/api/analyze-unified/route.ts`
- `src/lib/services/StratumInvestigator.ts`
- `src/lib/ai/unified-analyzer.ts`
- `src/lib/cache/stratum-cache.ts`

Verified contradiction: product copy and UI labels overstated implementation reality. The app metadata said "Institutional-grade," the UI presented an "Evidence column," and docs said "market-ready," while the runtime system remained a transient dashboard over live data.

## Verified architecture
Verified: Framework and runtime were Next.js 16 App Router with React 19 and TypeScript, using `npm` and `package-lock.json`.

Verified: The audited route surface was essentially one page and one API route:
- `/`
- `/api/analyze-unified`

Verified: Build output showed `/` as static and `/api/analyze-unified` as dynamic during the audit.

Verified: Active data providers were:
- Greenhouse
- Lever
- Ashby
- Workable

Verified: Active AI stack was Google Gemini via `@google/genai`, using model `gemini-3-flash-preview`.

Verified: Active stateful storage in the product path was only two in-memory `Map`s:
- cache map in `src/lib/cache/stratum-cache.ts`
- rate-limit map in `src/lib/security/RateLimiter.ts`

Verified: An MCP stdio server existed in `src/mcp-server.ts`, but it was not the audited user-facing product path.

Inferred: Hosting was generic Node or Next deployment. No `vercel.json`, Docker deployment spec, or CI manifest established a concrete target.

Verified dependency and unused-surface finding:
- `mongodb`, `@solana/web3.js`, `axios`, `date-fns`, `framer-motion`, `lru-cache`, and `uuid` were present in dependencies but not part of the active report architecture.
- `MONGODB_URI` existed in env, but no MongoDB persistence existed in the app path.

## Actual data flow
Verified runtime sequence:

```text
TruthConsole.handleAnalyze(companyName)
  -> POST /api/analyze-unified
  -> POST(): checkRateLimit(ip), validate body, sanitize name, getCached(name)
  -> StratumInvestigator.investigate(name)
  -> fetchCompanyJobs(name)
     -> toBoardToken / getSourceOrder
     -> fetchFromGreenhouse | fetchFromLever | fetchFromAshby | fetchFromWorkable
     -> normalize each job to { title, location, department, updated_at }
  -> if jobs.length === 0: return "No job board found"
  -> calculateEngineeringVsSalesRatio(jobs)
  -> runStratumAnalysis(company, jobs)
     -> build prompt from company + flattened job strings
     -> Gemini JSON response
     -> parse to { hiringVelocity, strategicVerdict, keywordFindings, notableRoles, summary }
  -> setCached(name, result)
  -> client setResult(data)
  -> UI renders verdict, summary, keywordFindings, notableRoles, jobs.length, latency, source
```

Verified entrypoint:
- `src/components/truth/TruthConsole.tsx`
- `handleAnalyze(companyName)`

Verified request path:
- `src/app/api/analyze-unified/route.ts`
- `POST`

Verified provider orchestration point:
- `src/lib/api/boards.ts`
- `fetchCompanyJobs`

Verified AI execution point:
- `src/lib/ai/unified-analyzer.ts`
- `runStratumAnalysis`

Verified what entered the model:
- company name
- job title
- department
- location
- updated timestamp

Verified what did not enter the model:
- provider job IDs
- source URLs
- raw payloads
- source hashes
- full descriptions
- persistent snapshot metadata

Verified UI reality:
- the UI did not render raw jobs or structured evidence chains
- the backend returned more data than the UI used
- the visible screen emphasized LLM-generated narrative fields

## Persistence reality check
Verified: There was no durable storage in the audited product path.

Verified durable storage not found for:
- raw third-party payloads
- normalized company snapshots
- generated intelligence summaries
- prompt inputs
- model outputs
- PDFs
- screenshots
- report metadata
- audit logs
- version history
- report requests

Verified: The only stateful mechanisms were:
- `const cache = new Map` in `src/lib/cache/stratum-cache.ts`
- `const store = new Map` in `src/lib/security/RateLimiter.ts`

Verified consequences:
- data was mutable in place
- state was process-local
- data disappeared on restart
- records were overwritten by key
- there was no immutable retention layer

Verified: Point-in-time reconstruction did not exist.

Why:
- request body only contained `companyName`
- there was no `as_of_time`
- there was no `report_run_id`
- there was no `report_version_id`
- there were no stored input blobs
- there were no stored output blobs

Verified: Error and no-data states were cached too. That meant a transient upstream failure could become a cached false negative.

Inferred: In a multi-instance or serverless deployment, cache hits and rate limits would be inconsistent across instances because state was local memory only.

## AI prompt and output audit
Verified: Prompt quality was weak for enterprise reporting because the model was asked to infer strategy and hiring velocity from sparse job metadata only.

Verified AI prompt source:
- `src/lib/ai/unified-analyzer.ts`
- `systemInstruction`
- `prompt`

Verified critical flaw 1:
Missing or invalid provider dates were replaced with the current timestamp before prompting the model.

Observed pattern:
- `updated_at: ... ?? new Date().toISOString()`

Why this mattered:
- the prompt explicitly asked Gemini to assess recency and hiring velocity
- the code could fabricate freshness signals

Verified critical flaw 2:
The response parser did not enforce a true schema. It used `JSON.parse` plus shallow shape checks. There were no citations, no confidence model tied to evidence, and no validation against source counts.

Verified critical flaw 3:
The UI label "Evidence column" did not correspond to evidence. It rendered LLM-generated `keywordFindings` and `notableRoles`, not traceable source citations.

Verified critical flaw 4:
Runtime outputs were hype-heavy and uncited. During probes, the system produced strategic narrative language with no evidence object model attached.

Unknown:
- `thoughtSummary` exposure existed in code, but sampled runtime responses did not include it during the audit session.

## Report credibility assessment
Verified answer: No, the audited system could not honestly support enterprise async sharing.

Why:
- no persistent source snapshot
- no immutable report artifact
- no report IDs
- no prompt/model/output version capture
- no claim-to-citation model
- source metadata discarded during normalization
- preview model usage
- live-fetch-only architecture

Verified provenance problem:
The UI footer hardcoded "Data from Greenhouse & Lever" even when runtime probes returned Ashby and Workable results.

Verified conclusion:
- no point-in-time intelligence
- no later verification of claims
- no consistent async executive sharing
- no CFO/VC-grade PDF export
- no internal auditability
- no reproducibility of a report from a past date
- no trustable evidence chain from source to final claim

## Security and operational risks
Critical at audit time:
- hardcoded Gemini API key committed in `scripts/list_models.js`

High:
- provider failures were silently converted into 200-level product responses like `No job board found`
- failed or empty results were then cacheable
- there was no auth, RBAC, or persistent audit trail on the API path

Medium:
- reported latency was wrong because `analysisTimeMs` was computed before Gemini finished
- MCP startup was fragile and could run with missing AI configuration
- `SystemStatusBar` surfaced decorative trust indicators rather than live telemetry
- cache was unbounded and only lazily evicted

Low:
- unused dependencies and legacy assets remained
- lint was not clean
- there was no test suite or CI
- some provider comments and examples were stale

## Product gaps blocking enterprise readiness
Verified highest-impact gaps:
- no immutable raw-source storage
- no normalized snapshot model with provider IDs, URLs, descriptions, and fetch timestamps
- no `report_run` or `report_version` persistence
- no claims/citations model
- no export layer for HTML/PDF/shareable artifacts
- no provider-health model distinct from unsupported-company behavior
- no auth, audit log, or organization access model

## Technical debt ranking

### Critical
- hardcoded API key in repo at audit time
- no persistence, evidence, snapshot, or reporting architecture

### High
- silent provider failure masking plus caching
- normalization discarding traceable source fields
- preview model with no version capture
- UI/footer and no-result copy lying about sources

### Medium
- underreported latency
- MCP env-load fragility
- unbounded cache
- `ServiceInterruptionModal` Escape behavior triggering reconnect path
- stale `Verified Active` comments in provider maps

### Low
- unused dependencies
- no CI
- no tests
- dead or stale alias behavior

## What is real today
These items were verified in the audit runtime:
- `npm run build` succeeded
- `npx tsc --noEmit` succeeded
- the app had one working search flow and one working API route
- live ATS fetches worked for all four providers during probes
- Gemini analysis worked on the web API path when env was present
- same-process caching and rate limiting worked
- the MCP server process started on stdio

## What is fake, implied, or unproven
Verified false or overstated implications at audit time:
- `Institutional-grade` was not backed by storage, evidence, or audit architecture
- `Corporate Intelligence` implied a stronger system than the implementation supported
- `Evidence column` was not evidence
- `Data from Greenhouse & Lever` was false for Ashby and Workable-backed results
- `market-ready` docs overstated delivery maturity
- `mongodb` dependency and `MONGODB_URI` implied persistence that did not exist
- `generate:sentinel` implied a script that did not exist
- PDF export, report persistence, snapshot history, and evidence traceability were absent
- `SYSTEM: ONLINE` and `REGION: US-EAST` were UI fiction

## Recommended target architecture
Verified recommendation from the audit:
- store raw provider payloads immutably in object storage
- store normalized jobs and company snapshots in a relational database
- run analysis only from stored snapshots
- persist prompt version, model version, inputs, outputs, claims, and citations
- publish immutable report versions
- generate HTML and PDF from stored report JSON
- add auth, RBAC, audit logging, and provider-health tracking

## First migration plan
The smallest sensible migration sequence identified by the audit was:
1. Stop caching zero-job and provider-error results.
2. Persist raw ATS payloads and normalized jobs with source anchors.
3. Add `report_run` and `report_version` persistence.
4. Add claim-to-citation objects tied to exact source records.
5. Render durable report versions and PDF/share exports from stored state.
6. Add auth, audit logs, and access control before enterprise positioning resumes.

## Capability verdict matrix

| Capability | Verdict | Audit label | Evidence |
|---|---|---|---|
| Live hiring data fetch exists | Yes | Verified | `src/lib/api/boards.ts`, `src/lib/api/ashby.ts`, `src/lib/api/workable.ts`; runtime probes returned `GREENHOUSE`, `LEVER`, `ASHBY`, and `WORKABLE` sources |
| Hiring data normalization exists | Yes | Verified | provider adapters normalized records into `{ title, location, department, updated_at }` |
| AI summary generation exists | Yes | Verified | `src/lib/ai/unified-analyzer.ts`, `runStratumAnalysis`, Gemini SDK call |
| Snapshot persistence exists | No | Verified | only in-memory `Map` storage existed |
| Raw source payload storage exists | No | Verified | raw provider JSON was parsed and discarded after mapping |
| Point-in-time report reconstruction exists | No | Verified | no date input, no snapshot IDs, no durable report objects |
| PDF export exists | No | Verified | no PDF/export implementation found |
| Report versioning exists | No | Verified | no report version tables, files, or symbols found |
| Audit trail exists | No | Verified | only transient console logs and rate-limit memory state existed |
| Evidence traceability from source to claim exists | No | Verified | provider IDs and URLs were dropped before AI; UI evidence labels were narrative strings only |

## External call inventory

| Provider | Endpoint or SDK | Auth | Calling path | Fallback behavior | Stored or discarded |
|---|---|---|---|---|---|
| Greenhouse | `https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` | none | `src/lib/api/boards.ts`, `fetchFromGreenhouse` | 404 triggered source fallback; other failures were swallowed by orchestration | raw response discarded after mapping; final result only cacheable in memory |
| Lever | `https://api.lever.co/v0/postings/{site}?mode=json` | none | `src/lib/api/boards.ts`, `fetchFromLever` | same fallback path as above | raw response discarded after mapping |
| Ashby | `https://api.ashbyhq.com/posting-api/job-board/{company}` | none | `src/lib/api/ashby.ts`, `fetchFromAshby` | same source fallback path | raw response discarded after mapping |
| Workable | `https://apply.workable.com/api/v1/widget/accounts/{company}` | none | `src/lib/api/workable.ts`, `fetchFromWorkable` | same source fallback path | raw response discarded after mapping |
| Google Gemini | `@google/genai`, `GoogleGenAI`, `ai.models.generateContent` | `GEMINI_API_KEY` from env | `src/lib/ai/unified-analyzer.ts`, `runStratumAnalysis` | failures returned `null` and collapsed into `Analysis failed` product output | parsed response may be cached in memory; raw output not durably stored |

## Data persistence inventory

| Technology | Exact name | Write path | Read path | Immutable | Historical reconstruction |
|---|---|---|---|---|---|
| Process memory `Map` | `cache` in `src/lib/cache/stratum-cache.ts` | `setCached` called by `/api/analyze-unified` | `getCached` called by `/api/analyze-unified` | No | No |
| Process memory `Map` | `store` in `src/lib/security/RateLimiter.ts` | `checkRateLimit` | `checkRateLimit` and `prune` | No | No |

Verified: no durable database, object store, bucket, or table was active in the audited product path.

## Prompt forensics

### Verified prompt sources
- `src/lib/ai/unified-analyzer.ts`
- top-level `systemInstruction`
- `runStratumAnalysis`
- `prompt`

### Verified prompt snippet
`Assess hiring velocity based on total open roles and recency of postings.`

### Verified dynamic prompt content
- company name
- flattened list of job strings
- title
- department
- location
- updated_at

### Verified grounding problem
Claims could not be traceably grounded because the prompt never received provider IDs, URLs, or source payload anchors.

### Verified output form
- intended as JSON
- parsed with `JSON.parse`
- shallowly checked
- not citation-aware
- not strongly schema-validated

### Verified date fabrication issue
Missing dates were replaced with `new Date().toISOString()` before prompting, contaminating any recency-based reasoning.

## UI credibility gaps
Verified examples:
- `src/app/layout.tsx` metadata described the app as institutional-grade despite lacking audit and storage architecture.
- `src/components/truth/TruthConsole.tsx` used the label `Evidence column` even though it rendered LLM strings, not source citations.
- `src/components/truth/TruthConsole.tsx` hardcoded `Data from Greenhouse & Lever` even when Ashby and Workable supplied the result.
- `src/components/ui/SystemStatusBar.tsx` hardcoded `SYSTEM: ONLINE` and `REGION: US-EAST`.
- `analysisTimeMs` was displayed as a trust signal even though it excluded Gemini runtime.

## Hard contradictions

### UI claims vs backend reality
- Footer said `Data from Greenhouse & Lever` while runtime returned Ashby and Workable results.
- `Evidence column` implied evidence traceability that did not exist.

### Architecture claims vs actual storage
- Docs and metadata implied institutional rigor while the product path stored nothing durably.
- `mongodb` and `MONGODB_URI` implied persistence that was not wired into the app.

### Reporting claims vs reproducibility
- `market-ready` language contradicted the absence of snapshots, report versions, and artifacts.
- the product could not reopen a past report because no durable report existed

### Intelligence language vs evidence support
- prompts asked for strategic proof while normalization had already discarded the source fields needed to support proof
- UI rendered strategic claims without a claim-to-citation model

### Comment and behavior contradictions
- `/api/analyze-unified` comments mentioned one-hour caching while `stratum-cache.ts` defaulted to 24 hours
- `MARKET_READY.md` claimed Escape closes the interruption modal cleanly, but the code path also triggered reconnect behavior

## Final verdict
Verified: Stratum, at audit time, was a prototype/demo rather than an enterprise tool.

Verified: It could fetch live hiring data and generate polished AI summaries.

Verified: It could not credibly support executive async sharing because it had no storage-backed proof model.

Verified: It had no raw-source persistence, no immutable snapshots, no report versions, no citations, no PDFs, and no audit trail.

Unknown: whether the founder was actively selling certainty externally at that exact moment.

Verified: The repo and UI language sold a stronger sense of rigor than the architecture could support.

## Evidence appendix
Key files reviewed during the audit:
- `package.json`
- `next.config.ts`
- `src/app/api/analyze-unified/route.ts`
- `src/lib/services/StratumInvestigator.ts`
- `src/lib/api/boards.ts`
- `src/lib/ai/unified-analyzer.ts`
- `src/components/truth/TruthConsole.tsx`
- `src/mcp-server.ts`
- `scripts/list_models.js` at audit time
- `src/components/ui/ServiceInterruptionModal.tsx`
- `src/components/ui/SystemStatusBar.tsx`
- `docs/MARKET_READY.md`
- `docs/PRODUCTION_AUDIT.md`
- `docs/STRATUM_CONTEXT.md`

Commands and runtime checks recorded in the audit:
- `npm run build`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run generate:sentinel`
- `npm run mcp`
- direct provider probes against Greenhouse, Lever, Ashby, and Workable
- repeated API probes against `/api/analyze-unified`

Runtime observations preserved from the audit:
- Airbnb returned `apiSource: GREENHOUSE`
- Plaid returned `apiSource: LEVER`
- Notion returned `apiSource: ASHBY`
- supportyourapp returned `apiSource: WORKABLE`
- repeated Airbnb call returned `cached: true`
- repeated same-IP calls triggered `429`
- no-such-company cases returned HTTP `200` with `strategicVerdict: "No job board found"`
