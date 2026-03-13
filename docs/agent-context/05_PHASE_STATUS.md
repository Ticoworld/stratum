# Phase Status

## Phase 1 status
Completed.

Phase 1 scope was limited to foundation work:
- central env handling
- Postgres connection setup
- Drizzle schema scaffolding
- migration setup
- S3 client setup
- auth foundation
- minimal tenant/user/membership model

No ATS fetching, worker logic, AI redesign, reporting, citations, or artifacts were added in Phase 1.

## Exact files created in Phase 1
- `drizzle.config.ts`
- `src/lib/env.ts`
- `src/db/client.ts`
- `src/db/schema/tenants.ts`
- `src/db/schema/users.ts`
- `src/db/schema/memberships.ts`
- `src/db/schema/index.ts`
- `src/db/migrations/0000_strange_storm.sql`
- `src/db/migrations/meta/0000_snapshot.json`
- `src/db/migrations/meta/_journal.json`
- `src/lib/storage/s3.ts`
- `src/auth.ts`
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/lib/auth/roles.ts`
- `src/lib/auth/bootstrapUser.ts`
- `src/lib/auth/session.ts`
- `src/types/auth.d.ts`

## Exact files modified in Phase 1
- `.env.example`
- `package.json`
- `package-lock.json`
- `src/app/layout.tsx`

## Exact files deleted in Phase 1
- `scripts/list_models.js`

## Commands run
- `npm install drizzle-orm drizzle-kit postgres next-auth @aws-sdk/client-s3`
- `npm install next-auth@beta`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run lint` (rerun after final fixes)
- `npx tsc --noEmit` (rerun after final fixes)

## Validation outcomes
- `npm install`: passed
- `npm run lint`: passed with one pre-existing warning in `src/components/ui/ServiceInterruptionModal.tsx`
- `npx tsc --noEmit`: passed
- `npm run build`: passed
- `npm run db:generate`: passed after escalated rerun because sandbox execution hit `spawn EPERM`
- `npm run db:migrate`: passed after escalated rerun because sandbox execution hit `spawn EPERM`

## Caveats that still matter
- The Google auth flow was wired and compiled, but this conversation did not perform an interactive browser sign-in to verify callback behavior end to end.
- The old ATS-to-LLM dashboard flow still exists and remains the active product path.
- The repo still contains one unrelated lint warning in `src/components/ui/ServiceInterruptionModal.tsx`.
- AWS env vars are optional in Phase 1 and are not yet exercised by any write path.
- The generated initial migration file name is `0000_strange_storm.sql`; future sessions should not rename it casually because it has already been applied.

## What Phase 1 changed architecturally
- Added one central env module for the new infrastructure surface.
- Added a PostgreSQL + Drizzle foundation.
- Added the first committed migration and migrated the Phase 1 tables.
- Added a minimal identity and tenancy model: `tenants`, `users`, `memberships`.
- Added an Auth.js + Google OIDC foundation with JWT sessions.
- Added a first-login bootstrap path that creates or reuses a user, tenant, and owner membership.
- Added optional S3 client scaffolding without making AWS mandatory.
- Removed the committed `scripts/list_models.js` secret leak.

## What Phase 1 explicitly did not touch
- ATS provider fetching logic
- the existing `/api/analyze-unified` product flow
- Gemini prompt logic
- report runs
- worker claiming or background processing
- source snapshot storage
- normalized job persistence
- claims
- citations
- report versions
- artifacts
- HTML report rendering
- PDF generation
- executive sharing

## Phase 3 status
Completed and runtime-verified.

Phase 3 scope was limited to report-run orchestration and worker foundation:
- report-run creation flow
- report-run status flow
- worker entrypoint and loop
- Postgres row claiming with `FOR UPDATE SKIP LOCKED`
- worker execution of the frozen snapshot stage only
- connection of the worker to the completed Phase 2 capture path
- one-shot worker env bootstrapping and clean process exit

No structured analysis, claims, citations, report publication, report versions, artifacts, HTML rendering, PDF generation, share links, or report detail read path were added in Phase 3.

## Exact files created in Phase 3
- `src/lib/auth/requireTenantRole.ts`
- `src/lib/reports/createReportRun.ts`
- `src/lib/reports/getReportRun.ts`
- `src/lib/reports/claimNextReportRun.ts`
- `src/lib/reports/executeReportRun.ts`
- `src/app/api/report-runs/route.ts`
- `src/app/api/report-runs/[reportRunId]/route.ts`
- `src/worker/main.ts`
- `src/worker/start.ts`
- `src/worker/loop.ts`
- `src/worker/steps/resolveCompany.ts`
- `src/worker/steps/fetchSnapshots.ts`
- `src/worker/steps/normalizeSnapshots.ts`

## Exact files modified in Phase 3
- `package.json`
- `src/lib/capture/captureCompanySnapshot.ts`
- `src/lib/providers/ats/fetchProviderSnapshot.ts`
- `src/lib/storage/s3.ts`

## Commands run for Phase 3
- `npx tsc --noEmit`
- `npm run lint`
- `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config --eval '...createReportRun...'`
- `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config --eval '...getReportRun...'`
- `npm run worker:report-runs -- --once`

## Phase 3 validation outcomes
- `npx tsc --noEmit`: passed
- `npm run lint`: passed with one pre-existing warning in `src/components/ui/ServiceInterruptionModal.tsx`
- report-run creation: passed
- worker claim and snapshot-stage execution: passed
- report-run status fetch before and after worker execution: passed
- `npm run worker:report-runs -- --once` env bootstrapping: passed after worker startup was changed to load `.env.local` then `.env`
- `npm run worker:report-runs -- --once` clean exit after finishing a queued run: passed

## What Phase 3 changed architecturally
- Added the first real queued `report_runs` write path.
- Added the first authenticated `report-runs` API surface.
- Added worker claiming against Postgres rows with `FOR UPDATE SKIP LOCKED`.
- Added worker execution for the snapshot stage only: resolve company, fetch provider snapshot, store raw blob, persist `source_snapshots`, persist `normalized_jobs`, and advance terminal Phase 3 run state.
- Preserved the approved strangler path by reusing the completed Phase 2 provider freeze modules instead of inventing a parallel ingestion flow.
- Added a worker bootstrap path that loads `.env.local` then `.env` for standalone execution.

## What Phase 3 explicitly did not touch
- structured analysis
- claims
- citations
- report versions
- canonical `report.json`
- report publication
- HTML report rendering
- PDF generation
- share links
- report detail read path
- UI cutover away from the legacy dashboard

## Phase 4 status
Completed.

Phase 4 scope was limited to structured analysis:
- structured analysis over frozen inputs
- analysis validation
- claims persistence
- citations persistence

No report publication, canonical `report.json`, report detail read path, HTML rendering, PDF generation, share links, or UI cutover were added in Phase 4.

## Phase 5 status
Completed.

Phase 5 scope was limited to publication:
- canonical `report.json` generation from persisted run and analysis data
- publication validation
- `report_versions` persistence
- worker publication stage
- minimal stored report read path

No HTML rendering, PDF generation, artifact storage, share links, or UI cutover were added in Phase 5.

## Phase 6 status
Completed and runtime-verified.

Phase 6 scope was limited to artifacts:
- HTML generation from stored canonical `report.json`
- PDF generation from stored canonical report data
- artifact persistence to object storage
- artifact metadata persistence
- protected artifact retrieval routes
- protected PDF ensure route
- worker connection from published `report_versions` into artifact generation

No share links, recurring monitoring, broad UI cutover, collaborative features, analytics dashboards, provider fetches in artifact read paths, AI calls in artifact read paths, or later-phase cleanup were added in Phase 6.

## Phase 6 validation outcomes
- `npm run db:generate`: passed
- `npm run db:migrate`: passed
- `npx tsc --noEmit`: passed
- `npm run lint`: passed with one pre-existing warning in `src/components/ui/ServiceInterruptionModal.tsx`
- `npm run build`: passed
- direct object storage `put/get/delete`: passed
- HTML artifact generation from stored `report.json`: passed
- PDF artifact generation from stored canonical report data: passed
- artifact metadata persistence in `artifacts`: passed
- artifact blob persistence and reload from object storage: passed
- tenant-scoped published report load with correct tenant: passed
- tenant-scoped published report load with wrong tenant: denied as expected
- unauthenticated artifact GET routes: returned `401` as expected
- unauthenticated PDF ensure route: returned `401` as expected

## What Phase 6 changed architecturally
- Added the `artifacts` table and migration.
- Added deterministic object keys for `report.html` and `report.pdf`.
- Added persisted HTML and PDF artifact generation from stored report payloads only.
- Added artifact persistence in object storage plus metadata persistence in Postgres.
- Added worker-side artifact rendering after Phase 5 publication.
- Added protected artifact retrieval routes and protected PDF ensure flow.
- Exposed real artifact availability on the stored report read path.

## What Phase 6 explicitly did not touch
- share links
- recurring monitoring
- broad UI cutover
- cleanup of the legacy dashboard path
- provider fetches in artifact read paths
- AI calls in artifact read paths

## Phase 7 status
Completed.

Phase 7 scope was limited to UI cutover:
- home page refactor into a real report request flow
- TruthConsole refactor away from live ATS-to-LLM answer rendering
- real report-run status UI
- product-facing navigation to stored published reports
- real artifact availability in the UI
- removal of fake trust indicators and misleading enterprise theater from the product-facing path
- compatibility cutover of `/api/analyze-unified` away from the live product flow and into report-run creation

No recurring monitoring, share links, analytics dashboards, collaborative features, MCP product integration, Phase 8 cleanup, or redesign of earlier backend phases were added in Phase 7.

## Exact files created in Phase 7
- `src/app/report-runs/[reportRunId]/page.tsx`

## Exact files modified in Phase 7
- `src/app/api/analyze-unified/route.ts`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/reports/[reportVersionId]/page.tsx`
- `src/components/truth/TruthConsole.tsx`
- `src/components/ui/SystemStatusBar.tsx`
- `src/lib/reports/getReportRun.ts`
- `src/lib/reports/listReportVersions.ts`

## Commands run for Phase 7
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

## Phase 7 validation outcomes
- `npx tsc --noEmit`: passed
- `npm run build`: passed
- `npm run lint`: passed with one pre-existing warning in `src/components/ui/ServiceInterruptionModal.tsx`
- home page report-run creation flow: passed
- report-run status page route: passed
- stored published report page on stored data only: passed
- real artifact availability surfaced in product-facing UI: passed
- legacy `/api/analyze-unified` live result path removed from the product surface: passed

## What Phase 7 changed architecturally
- Completed the product-facing UI cutover onto the stored report system.
- Made the home page the real report request entrypoint.
- Added a real report-run status page.
- Replaced fake UI trust theater with real run/report/artifact status.
- Kept published report reads tied to stored report data and stored artifacts only.
- Converted `/api/analyze-unified` into a compatibility report-run creation shim instead of a live ATS-to-LLM product route.

## What Phase 7 explicitly did not touch
- Phase 8 cleanup work beyond what the UI cutover strictly required
- recurring monitoring
- share links
- analytics dashboards
- collaborative features
- MCP product integration
- redesign of Phases 1 through 6 backend architecture

## Current phase boundary
- Phase 1: complete
- Phase 2: complete
- Phase 3: complete
- Phase 4: complete
- Phase 5: complete
- Phase 6: complete
- Phase 7: complete
- Phase 8: complete
- Next approved phase: none recorded

## Phase 8 status
Completed.

Phase 8 scope was limited to cleanup and retirement work:
- removal of the leftover compatibility route after UI cutover
- removal of the cache-backed demo orchestration path
- retirement of `StratumInvestigator`
- isolation/removal of the MCP entrypoint that still depended on the retired demo path
- removal of dead package scripts tied to removed legacy tooling
- context and repo documentation updates to reflect the post-migration state

No Phase 9 work, recurring monitoring, share-link expansion, analytics dashboards, collaborative features, broad redesign, or backend redesign were added in Phase 8.

## Exact files deleted in Phase 8
- `src/app/api/analyze-unified/route.ts`
- `src/lib/services/StratumInvestigator.ts`
- `src/lib/ai/unified-analyzer.ts`
- `src/lib/cache/stratum-cache.ts`
- `src/lib/api/boards.ts`
- `src/lib/gemini.ts`
- `src/mcp-server.ts`

## Exact files modified in Phase 8
- `.env.example`
- `README.md`
- `package.json`
- `docs/STRATUM_CONTEXT.md`
- `docs/agent-context/00_README.md`
- `docs/agent-context/05_PHASE_STATUS.md`
- `docs/agent-context/06_ENV_AND_INFRA_DECISIONS.md`
- `docs/agent-context/09_NEXT_CODEX_START_PROMPT.md`
- `docs/agent-context/10_MACHINE_SUMMARY.json`

## What Phase 8 changed architecturally
- Deleted the obsolete `/api/analyze-unified` compatibility shim after Phase 7 made it unnecessary.
- Removed the remaining cache-backed demo orchestration files from the repo.
- Removed the obsolete MCP entrypoint that still invoked the retired live demo path.
- Left the stored-report architecture as the only product-facing path in the repo.

## What Phase 8 explicitly did not touch
- recurring monitoring
- share-link expansion
- analytics dashboards
- collaborative features
- broad visual redesign
- backend redesign
- redesign of Phases 1 through 7
