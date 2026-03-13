# Stratum

Stratum is a Next.js application for generating immutable point-in-time hiring intelligence reports from ATS job data.

The live ATS-to-LLM demo path has been retired. The product-facing system now creates queued `report_runs`, executes a frozen-input pipeline, publishes immutable `report_versions`, and serves stored HTML/PDF artifacts without live provider or AI calls on report read paths.

## Current system

- Authenticated report creation and tenant-scoped access control
- Raw ATS payload capture for Greenhouse, Lever, Ashby, and Workable
- Normalized job persistence with source anchors
- Worker-based report execution over frozen inputs
- Structured Gemini analysis with persisted claims and citations
- Canonical `report.json` publication
- Stored report read path
- HTML and PDF artifact generation from stored report data only

## Tech stack

- Next.js 16 App Router
- React 19 + TypeScript
- PostgreSQL + Drizzle ORM
- Auth.js with Google OIDC
- S3-compatible object storage
- Playwright for PDF generation
- Gemini via `@google/genai` for structured analysis

## Runtime roles

Stratum is one repo with two production runtime roles:

- Web runtime: serves the Next.js UI, auth, report pages, artifact retrieval, and readiness status.
- Worker runtime: claims queued `report_runs`, captures snapshots, runs analysis, publishes reports, and renders artifacts.
- Shared infrastructure: PostgreSQL and private S3-compatible object storage.

The web app can be deployed independently, and the worker can be deployed independently. Full production behavior requires both.

## Environment contract

### Shared required

These back shared infrastructure. Missing values block full production behavior.

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/stratum
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=replace_me
AWS_SECRET_ACCESS_KEY=replace_me
STRATUM_S3_BUCKET=replace_me
```

### Web-only required

These must be present on the web app runtime.

```env
AUTH_SECRET=replace_me
AUTH_GOOGLE_ID=replace_me
AUTH_GOOGLE_SECRET=replace_me
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Worker-only required

These must be present on the worker runtime.

```env
GEMINI_API_KEY=replace_me
```

### Optional / local-only

```env
STRATUM_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
STRATUM_ANALYSIS_RETRY_PROOF_FAILURES=0
```

### Optional web automation

Set this on the web runtime if you want report creation to immediately trigger the GitHub worker workflow instead of waiting for the scheduled run.

```env
GITHUB_DISPATCH_TOKEN=ghp_replace_me
```

## Local setup

1. Install dependencies.

```bash
npm install
```

2. Configure environment.

```bash
cp .env.example .env.local
```

3. Start the web runtime.

```bash
npm run dev:web
```

4. Validate the worker env contract, then start the worker.

```bash
npm run worker:check-env
npm run worker:report-runs -- --once
```

5. Build the web app.

```bash
npm run build
npm run start:web
```

## Production deployment

### Vercel web app

Set these on Vercel:

- Shared infrastructure: `DATABASE_URL`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `STRATUM_S3_BUCKET`
- Web-only: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `NEXT_PUBLIC_SITE_URL`
- Optional if needed: `STRATUM_S3_ENDPOINT` or `R2_ENDPOINT`
- Optional for immediate GitHub worker dispatch: `GITHUB_DISPATCH_TOKEN`

Responsibilities owned by the web runtime:

- Auth and tenant-scoped access control
- Report creation API gating
- Stored report pages
- Protected HTML/PDF retrieval
- `/api/deployment/readiness`

### Worker host

Set these on the worker host:

- Shared infrastructure: `DATABASE_URL`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `STRATUM_S3_BUCKET`
- Worker-only: `GEMINI_API_KEY`
- Optional if needed: `STRATUM_S3_ENDPOINT` or `R2_ENDPOINT`

Responsibilities owned by the worker runtime:

- Row claiming from `report_runs`
- ATS snapshot capture
- Structured analysis
- Publication
- HTML/PDF artifact generation
- Worker heartbeat writes to `worker_heartbeats`

### Shared secrets

These must match across web and worker:

- `DATABASE_URL`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `STRATUM_S3_BUCKET`
- `STRATUM_S3_ENDPOINT` or `R2_ENDPOINT` if used

## Operator clarity

- Web app up: load `/` or call `/api/deployment/readiness`
- Worker dependency configured: `/api/deployment/readiness` reports whether a recent `report-runs` heartbeat exists
- Report creation will work: `/api/deployment/readiness` reports `reportCreation.ready`; if false, the web API returns `503` and explains why

If the web app is up but the worker heartbeat is missing or stale, Stratum is only partially deployed and report creation is intentionally blocked.

## Main paths

- `/` creates report runs and lists recent reports
- `/report-runs/[reportRunId]` shows run status
- `/reports/[reportVersionId]` shows stored published reports
- `/api/report-runs/*` manages report-run writes and reads
- `/api/reports/*` serves stored reports and protected artifacts
- `/api/deployment/readiness` returns minimal deployment readiness JSON

## Project structure

```text
src/
  app/
    api/report-runs/*
    api/reports/*
    report-runs/[reportRunId]/page.tsx
    reports/[reportVersionId]/page.tsx
  db/
    client.ts
    schema/*
    migrations/*
  lib/
    analysis/*
    artifacts/*
    auth/*
    capture/*
    normalize/*
    providers/ats/*
    reports/*
    storage/*
  worker/
    start.ts
    loop.ts
    steps/*
scripts/
  test-new-boards.ts
  probe-company-slug.ts
docs/
  agent-context/*
  STRATUM_CONTEXT.md
```

## Historical note

Older docs outside `docs/agent-context/` may describe the pre-migration live demo. The canonical source of truth for the migrated system is `docs/agent-context/`.
