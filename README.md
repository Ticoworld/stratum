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

## Setup

1. Install dependencies.

```bash
npm install
```

2. Configure environment.

```bash
cp .env.example .env.local
```

Required foundation variables:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/stratum
AUTH_SECRET=replace_me
AUTH_GOOGLE_ID=replace_me
AUTH_GOOGLE_SECRET=replace_me
```

Required when the full report pipeline is exercised:

```env
GEMINI_API_KEY=your_key
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
STRATUM_S3_BUCKET=...
```

3. Run the app.

```bash
npm run dev
```

4. Run the worker.

```bash
npm run worker:report-runs -- --once
```

5. Build for production.

```bash
npm run build
npm run start
```

## Main paths

- `/` creates report runs and lists recent reports
- `/report-runs/[reportRunId]` shows run status
- `/reports/[reportVersionId]` shows stored published reports
- `/api/report-runs/*` manages report-run writes and reads
- `/api/reports/*` serves stored reports and protected artifacts

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
