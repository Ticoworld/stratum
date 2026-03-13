# Stratum Context

This file reflects the current post-migration product state.

For full source truth and phase history, use `docs/agent-context/`.

## What Stratum is
Stratum is an immutable report system for point-in-time hiring intelligence.

The product-facing flow is:
1. An authenticated user creates a `report_run`.
2. A worker captures raw ATS payloads and normalized jobs.
3. Structured analysis runs only on frozen inputs.
4. The system publishes an immutable `report_version` with claims and citations.
5. HTML and PDF artifacts are generated from stored report data only.
6. Users reopen stored reports without live ATS or live AI calls on the read path.

## Current architecture
- Next.js App Router control plane
- PostgreSQL + Drizzle as the system of record
- S3-compatible object storage for raw payloads and report/artifact blobs
- Auth.js with Google OIDC and tenant-scoped RBAC
- Postgres-backed worker claiming for report execution
- Gemini-based structured analysis over frozen inputs only

## Current product paths
- `/` creates report runs and lists recent published reports
- `/report-runs/[reportRunId]` shows real queued and terminal run states
- `/reports/[reportVersionId]` reads stored published report content only
- `/api/report-runs/*` manages queued run creation and status reads
- `/api/reports/*` serves stored report data and protected artifacts

## Current guarantees
- raw provider payloads are stored durably
- normalized jobs retain source anchors
- claims and citations are persisted before publication
- report reads do not call live ATS providers
- report reads do not call Gemini
- HTML and PDF derive from canonical stored report data

## Retired legacy paths
- the old live `/api/analyze-unified` demo route is gone
- the cache-backed ATS-to-LLM orchestration path is retired
- `StratumInvestigator`, the in-memory cache, and the legacy freeform analyzer are removed
- the old MCP entrypoint tied to the retired demo path is removed

## Environment notes
- `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET` are required
- S3 env vars are required once snapshot and artifact writes are exercised
- `GEMINI_API_KEY` is required for the structured analysis path
