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

## Current phase boundary
- Phase 1: complete
- Phase 2: complete
- Phase 3: complete
- Next approved phase: Phase 4
