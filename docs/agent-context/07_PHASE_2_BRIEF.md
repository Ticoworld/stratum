# Phase 2 Brief

Status: completed. This file is retained as the historical Phase 2 brief only.

Current planning note:
- Do not execute Phase 2 again.
- Phase 3 is complete.
- Phase 4 is complete.
- Phase 5 is complete.
- The next approved phase is Phase 6.

## Goal of Phase 2
Phase 2 is the provider freeze path.

Its job is to move Stratum one step closer to immutable report architecture by capturing raw ATS payloads and normalized hiring data in durable storage, without yet introducing the worker, structured analysis, report publication, claims, citations, or PDF/export layers.

Phase 2 is about freezing source data, not about rendering finished reports.

## Expected files and modules to add or refactor

### Refactor current ATS modules
Refactor the existing ATS-fetching code out of the legacy `src/lib/api/*` product shape and toward the approved provider module layout:
- `src/lib/providers/ats/greenhouse.ts`
- `src/lib/providers/ats/lever.ts`
- `src/lib/providers/ats/ashby.ts`
- `src/lib/providers/ats/workable.ts`
- `src/lib/providers/ats/resolveCompany.ts`
- `src/lib/providers/ats/fetchProviderSnapshot.ts`

Current files likely to be refactored:
- `src/lib/api/boards.ts`
- `src/lib/api/ashby.ts`
- `src/lib/api/workable.ts`
- `src/lib/api/fetchWithRetry.ts`

### Add normalization modules
- `src/lib/normalize/normalizeJobs.ts`
- `src/lib/normalize/deriveJobMetrics.ts`

### Add storage helper modules
- `src/lib/storage/objectKeys.ts`
- `src/lib/storage/checksums.ts`

### Add new database schema files and migration work for the capture layer
Phase 2 should add only the tables required to durably capture provider input and normalized output for later analysis. Based on the approved implementation spec, that means:
- `companies`
- `company_provider_accounts`
- `source_snapshots`
- `normalized_jobs`

Important note:
The approved full schema also includes `report_runs`, but worker claiming and report-run lifecycle belong to later phases. If a minimal `report_runs` table is required to preserve foreign-key integrity for the capture model, add only the schema foundation that later phases depend on. Do not add public report-run APIs or worker semantics in Phase 2.

## What Phase 2 must not touch
- no worker loop
- no queue claiming logic
- no AI analysis redesign
- no claim model
- no citation model
- no report JSON publication
- no HTML report rendering
- no PDF rendering
- no share links
- no report detail read path
- no UI credibility polish beyond what is required to avoid breaking the current app

Phase 2 is not the phase to publish reports. It is the phase to preserve source truth.

## Pass criteria
Phase 2 passes only if all of the following are true:
- raw ATS payloads can be fetched and stored durably as immutable blobs
- object keys and payload checksums are deterministic and recorded
- normalized jobs are stored durably in Postgres with source anchors
- provider job identifiers, URLs, timestamps, and raw record paths are retained
- the new capture path does not require AI or PDF dependencies
- the capture path does not depend on the future report read path
- legacy app behavior is not accidentally broken by the refactor

## Fail criteria
Phase 2 fails if any of the following happen:
- raw payloads are still discarded after fetch
- normalized jobs still strip away provider identifiers or traceability fields
- worker logic or report publication logic gets introduced early
- AI analysis is introduced before frozen data storage exists
- the implementation drifts into claims, citations, or report rendering

## Dependencies from Phase 1
Phase 2 depends on these already-complete pieces:
- `src/lib/env.ts`
- `src/db/client.ts`
- Drizzle migration infrastructure
- Auth.js foundation
- optional S3 client scaffolding

Phase 2 must reuse those foundations rather than invent parallel config or storage layers.

## Risks and guardrails
- The current ATS code is tightly coupled to the old `/api/analyze-unified` flow. Refactor carefully so provider fetching can be reused without changing the legacy product behavior prematurely.
- Do not let normalization collapse source traceability again. Provider IDs, URLs, raw record paths, and timestamps must survive Phase 2.
- Object storage must be used for raw payload blobs, not Postgres text columns.
- Keep any new env requirements aligned with the approved rule: AWS/S3 was optional in Phase 1 but will become operationally necessary once blob writes begin.
- If a schema dependency forces limited early introduction of a later table such as `report_runs`, keep it schema-only and do not build later-phase behavior on top of it yet.

## Exact boundaries
Allowed in Phase 2:
- provider module refactor
- raw payload capture
- checksum generation
- object key generation
- immutable snapshot persistence
- immutable normalized-job persistence
- capture-layer migrations

Not allowed in Phase 2:
- worker claiming
- queue orchestration
- LLM prompts
- analysis validation
- claims
- citations
- report publishing
- HTML rendering
- PDF generation
- shareable report routes
