# Stratum Implementation Spec

## 1. Hard technical choices

| Decision | Choice | Why |
|---|---|---|
| Database and query layer | PostgreSQL + Drizzle ORM + `drizzle-kit` migrations | Smallest serious addition to the current TypeScript repo. Explicit schema control fits immutable report tables better than a black-box ORM. |
| Queue mechanism | Postgres-backed queue using `report_runs` row claiming with `FOR UPDATE SKIP LOCKED` | No extra infrastructure in v1. Good enough for report generation throughput and retry control. |
| Object storage | AWS S3, one private bucket per environment | Durable, signed downloads, enterprise-standard, simple artifact/raw-payload storage. |
| Auth / RBAC approach | Auth.js with Google OIDC for users; tenant/membership RBAC in Postgres; hashed share links for external readers | Fits the current Next.js app with minimal moving parts. External executive sharing needs revocable share tokens. |
| Schema validation | Zod for API, worker IO, AI input/output, and canonical `report.json` validation | Already in the repo. Reuse it everywhere instead of inventing a second validator. |
| PDF renderer | Playwright Chromium | Deterministic HTML-to-PDF path from one canonical report payload. |
| Background worker runtime | Dedicated Node 22 worker process in the same repo, launched via local `tsx` script | Smallest serious worker model. Avoids serverless timeout issues and keeps code sharing simple. |
| Migration strategy from current cache-only flow | Strangler pattern: keep ATS adapters, replace live route with report-run creation, keep old live flow only as internal preview until cutover, then delete cache-backed product path | Minimizes rework and avoids a big-bang rewrite. |

## 2. Repo impact map

| Current path | Fate | Exact action |
|---|---|---|
| `src/app/api/analyze-unified/route.ts` | replace | Turn into temporary compatibility shim returning `202 Accepted` plus `report_run_id`, then delete after UI cutover. |
| `src/lib/api/boards.ts` | refactor | Split into provider resolution plus provider fetch orchestration. Keep network logic, stop returning final product results. |
| `src/lib/api/ashby.ts` | refactor | Keep fetch logic, return raw payload plus normalized extraction hooks. |
| `src/lib/api/workable.ts` | refactor | Same as above. |
| `src/lib/api/fetchWithRetry.ts` | keep as-is | Reuse in provider snapshot fetches. |
| `src/lib/ai/unified-analyzer.ts` | replace | Replace freeform summarizer with structured `analysis input -> validated claims/citations output`. |
| `src/lib/services/StratumInvestigator.ts` | replace | Replace with worker-side `ReportRunExecutor`. This file should stop being the product orchestrator. |
| `src/lib/cache/stratum-cache.ts` | delete later | Keep only if an internal preview route still needs it during migration. Not part of report product. |
| `src/lib/security/RateLimiter.ts` | refactor | Reuse for API abuse control, not as a report-state mechanism. |
| `src/lib/gemini.ts` | refactor | Keep SDK bootstrap idea, move under analysis layer with central env validation. |
| `src/app/page.tsx` | refactor | Home becomes report request page, not live result page. |
| `src/components/truth/TruthConsole.tsx` | refactor | Convert into `Create report` and `run status` UI. Remove direct live-result rendering. |
| `src/components/ui/SystemStatusBar.tsx` | replace | Replace fake ops indicators with real report metadata and status. |
| `src/mcp-server.ts` | keep as-is for internal only | Remove from product path. Phase-later refactor to trigger report runs or fetch published reports only. |
| `scripts/test-new-boards.ts` | refactor | Convert to provider integration smoke test against snapshot fetchers. |
| `scripts/probe-company-slug.ts` | keep as-is | Internal ops tool for provider token resolution. |
| `scripts/list_models.js` | delete immediately | Secret exposure. Not recoverable as-is. |
| `.env.example` and env loading | refactor | Add one central `src/lib/env.ts` and stop ad hoc env reads for the new infrastructure layer. |

## 3. New backend modules and file structure

```text
src/
  app/
    api/
      report-runs/
        route.ts
      report-runs/[reportRunId]/
        route.ts
      report-runs/[reportRunId]/retry/
        route.ts
      reports/
        route.ts
      reports/[reportVersionId]/
        route.ts
      reports/[reportVersionId]/artifacts/[artifactType]/
        route.ts
      reports/[reportVersionId]/artifacts/[artifactType]/ensure/
        route.ts
      share/[token]/
        route.ts
    reports/[reportVersionId]/page.tsx
    report-runs/[reportRunId]/page.tsx

  db/
    client.ts
    schema/
      tenants.ts
      users.ts
      memberships.ts
      companies.ts
      companyProviderAccounts.ts
      reportRuns.ts
      sourceSnapshots.ts
      normalizedJobs.ts
      analysisRuns.ts
      claims.ts
      citations.ts
      reportVersions.ts
      artifacts.ts
      auditEvents.ts
      shareLinks.ts

  lib/
    env.ts
    auth/
      session.ts
      requireTenantRole.ts
      requireReportAccess.ts
    audit/
      writeAuditEvent.ts
    storage/
      s3.ts
      objectKeys.ts
      checksums.ts
    providers/
      ats/
        greenhouse.ts
        lever.ts
        ashby.ts
        workable.ts
        resolveCompany.ts
        fetchProviderSnapshot.ts
    normalize/
      normalizeJobs.ts
      deriveJobMetrics.ts
    analysis/
      buildAnalysisInput.ts
      runStructuredAnalysis.ts
      validateAnalysisOutput.ts
      promptSpec.ts
    reports/
      createReportRun.ts
      claimNextReportRun.ts
      executeReportRun.ts
      publishReportVersion.ts
      validateForPublication.ts
      getReportVersion.ts
      listReportVersions.ts
      retryReportRun.ts
    artifacts/
      buildCanonicalReport.ts
      renderReportHtml.ts
      renderReportPdf.ts

  worker/
    main.ts
    loop.ts
    steps/
      resolveCompany.ts
      fetchSnapshots.ts
      normalizeSnapshots.ts
      analyzeFrozenData.ts
      publishReport.ts
      renderArtifacts.ts
```

## 4. Exact database schema spec

### `tenants`
- Columns: `id uuid`, `name text`, `slug citext`, `created_at timestamptz`
- PK: `id`
- Unique: `slug`
- Indexes: `slug`
- FKs: none
- Rule: mutable only for `name`

### `users`
- Columns: `id uuid`, `email citext`, `name text`, `auth_provider text`, `external_subject text`, `created_at timestamptz`
- PK: `id`
- Unique: `(auth_provider, external_subject)`, `email`
- Indexes: `email`
- FKs: none
- Rule: mutable only for `name`, `email`

### `memberships`
- Columns: `tenant_id uuid`, `user_id uuid`, `role text`, `created_at timestamptz`
- PK: `(tenant_id, user_id)`
- Unique: same as PK
- Indexes: `user_id`
- FKs: `tenant_id -> tenants.id`, `user_id -> users.id`
- Rule: mutable only for `role`

### `companies`
- Columns: `id uuid`, `tenant_id uuid`, `display_name text`, `canonical_name text`, `website_domain citext null`, `resolution_status text`, `created_at timestamptz`, `updated_at timestamptz`
- PK: `id`
- Unique: `(tenant_id, canonical_name)`
- Indexes: `(tenant_id, display_name)`, `(tenant_id, updated_at desc)`
- FKs: `tenant_id -> tenants.id`
- Rule: mutable

### `company_provider_accounts`
- Columns: `id uuid`, `company_id uuid`, `provider text`, `provider_token text`, `status text`, `resolution_source text`, `confidence numeric(5,2)`, `verified_at timestamptz null`, `last_success_at timestamptz null`, `last_failure_at timestamptz null`, `created_at timestamptz`, `updated_at timestamptz`
- PK: `id`
- Unique: `(company_id, provider, provider_token)`
- Indexes: `(company_id, provider)`, `(provider, provider_token)`
- FKs: `company_id -> companies.id`
- Rule: mutable

### `report_runs`
- Columns: `id uuid`, `tenant_id uuid`, `company_id uuid`, `requested_by_user_id uuid`, `trigger_type text`, `requested_company_name text`, `as_of_time timestamptz`, `status text`, `attempt_count integer`, `lock_token uuid null`, `locked_at timestamptz null`, `started_at timestamptz null`, `completed_at timestamptz null`, `failure_code text null`, `failure_message text null`, `created_at timestamptz`
- PK: `id`
- Unique: none
- Indexes: `(status, created_at)`, `(company_id, created_at desc)`, `(tenant_id, created_at desc)`
- FKs: `tenant_id -> tenants.id`, `company_id -> companies.id`, `requested_by_user_id -> users.id`
- Rule: mutable until terminal status

### `source_snapshots`
- Columns: `id uuid`, `report_run_id uuid`, `company_id uuid`, `provider text`, `provider_token text`, `request_url text`, `status text`, `http_status integer null`, `fetched_at timestamptz null`, `payload_object_key text null`, `payload_sha256 text null`, `record_count integer`, `error_code text null`, `error_message text null`, `created_at timestamptz`
- PK: `id`
- Unique: `(report_run_id, provider, provider_token)`
- Indexes: `(report_run_id)`, `(company_id, fetched_at desc)`, `(status)`
- FKs: `report_run_id -> report_runs.id`, `company_id -> companies.id`
- Rule: mutable until terminal status, then immutable

### `normalized_jobs`
- Columns: `id uuid`, `report_run_id uuid`, `source_snapshot_id uuid`, `provider text`, `provider_job_id text null`, `provider_requisition_id text null`, `job_url text null`, `title text`, `department text null`, `location text null`, `employment_type text null`, `workplace_type text null`, `posted_at timestamptz null`, `updated_at timestamptz null`, `raw_record_path text`, `normalized_sha256 text`, `created_at timestamptz`
- PK: `id`
- Unique: `(source_snapshot_id, normalized_sha256)`
- Indexes: `(report_run_id)`, `(source_snapshot_id)`, `(provider, provider_job_id)`
- FKs: `report_run_id -> report_runs.id`, `source_snapshot_id -> source_snapshots.id`
- Rule: immutable

### `analysis_runs`
- Columns: `id uuid`, `report_run_id uuid`, `analysis_sequence integer`, `status text`, `prompt_version text`, `model_provider text`, `model_name text`, `model_version text`, `input_object_key text`, `input_sha256 text`, `output_object_key text null`, `output_sha256 text null`, `started_at timestamptz null`, `completed_at timestamptz null`, `failure_code text null`, `failure_message text null`, `created_at timestamptz`
- PK: `id`
- Unique: `(report_run_id, analysis_sequence)`
- Indexes: `(report_run_id)`, `(status)`
- FKs: `report_run_id -> report_runs.id`
- Rule: mutable until terminal status

### `claims`
- Columns: `id uuid`, `analysis_run_id uuid`, `section text`, `claim_type text`, `statement text`, `why_it_matters text`, `confidence text`, `support_status text`, `display_order integer`, `created_at timestamptz`
- PK: `id`
- Unique: `(analysis_run_id, display_order)`
- Indexes: `(analysis_run_id, section, display_order)`
- FKs: `analysis_run_id -> analysis_runs.id`
- Rule: immutable

### `citations`
- Columns: `id uuid`, `claim_id uuid`, `source_snapshot_id uuid`, `normalized_job_id uuid`, `provider text`, `provider_job_id text null`, `job_url text null`, `job_title text`, `department text null`, `location text null`, `source_posted_at timestamptz null`, `source_updated_at timestamptz null`, `snapshot_fetched_at timestamptz`, `raw_record_path text`, `raw_field_paths jsonb`, `evidence_sha256 text`, `citation_order integer`, `created_at timestamptz`
- PK: `id`
- Unique: `(claim_id, citation_order)`
- Indexes: `(claim_id)`, `(normalized_job_id)`, `(source_snapshot_id)`
- FKs: `claim_id -> claims.id`, `source_snapshot_id -> source_snapshots.id`, `normalized_job_id -> normalized_jobs.id`
- Rule: immutable

### `report_versions`
- Columns: `id uuid`, `report_run_id uuid`, `analysis_run_id uuid null`, `version_number integer`, `status text`, `template_version text`, `report_object_key text`, `report_sha256 text`, `generated_at timestamptz`, `published_at timestamptz null`, `superseded_at timestamptz null`, `created_at timestamptz`
- PK: `id`
- Unique: `(report_run_id, version_number)`
- Indexes: `(report_run_id)`, `(status)`, `(published_at desc)`
- FKs: `report_run_id -> report_runs.id`, `analysis_run_id -> analysis_runs.id`
- Rule: mutable until `published`, then immutable

### `artifacts`
- Columns: `id uuid`, `report_version_id uuid`, `artifact_type text`, `status text`, `object_key text null`, `mime_type text null`, `byte_size bigint null`, `sha256 text null`, `failure_code text null`, `failure_message text null`, `created_at timestamptz`, `completed_at timestamptz null`
- PK: `id`
- Unique: `(report_version_id, artifact_type)`
- Indexes: `(report_version_id)`, `(status)`
- FKs: `report_version_id -> report_versions.id`
- Rule: mutable until `available`, then immutable

### `audit_events`
- Columns: `id bigserial`, `tenant_id uuid`, `actor_type text`, `actor_id uuid null`, `entity_type text`, `entity_id uuid`, `action text`, `request_id uuid null`, `ip_hash text null`, `metadata_json jsonb`, `occurred_at timestamptz`
- PK: `id`
- Unique: none
- Indexes: `(tenant_id, occurred_at desc)`, `(entity_type, entity_id, occurred_at desc)`
- FKs: `tenant_id -> tenants.id`
- Rule: immutable append-only

### `share_links`
- Columns: `id uuid`, `report_version_id uuid`, `created_by_user_id uuid`, `token_hash text`, `access_scope text`, `expires_at timestamptz null`, `revoked_at timestamptz null`, `access_count integer`, `last_accessed_at timestamptz null`, `created_at timestamptz`
- PK: `id`
- Unique: `token_hash`
- Indexes: `(report_version_id)`, `(expires_at)`
- FKs: `report_version_id -> report_versions.id`, `created_by_user_id -> users.id`
- Rule: mutable only for access counters and revocation

## 5. Exact object storage contract
- Bucket: `stratum-artifacts-{env}`
- Access: private only
- Checksums: SHA-256 hex for every blob, stored in Postgres before publication
- Compression: raw provider payloads stored as gzip JSON; canonical report JSON and HTML stored plain UTF-8; PDFs stored binary

Key layout:
- `raw/{tenant_id}/{company_id}/{report_run_id}/{provider}/{source_snapshot_id}.json.gz`
- `analysis-input/{report_run_id}/{analysis_run_id}.json`
- `analysis-output/{report_run_id}/{analysis_run_id}.json`
- `reports/{report_version_id}/report.json`
- `reports/{report_version_id}/report.html`
- `reports/{report_version_id}/report.pdf`

Writer ownership:
- provider fetch step writes `raw/...`
- analysis input builder writes `analysis-input/...`
- AI step writes `analysis-output/...`
- report publisher writes `reports/.../report.json`
- artifact renderer writes `reports/.../report.html` and `reports/.../report.pdf`

Retention:
- published report blobs: retain until tenant deletion workflow explicitly removes them
- failed non-published run blobs: retain 30 days
- superseded report versions: retain indefinitely in v1

## 6. State machines

### `report_runs`
- Statuses: `queued -> claimed -> resolving -> fetching -> normalizing -> analyzing -> validating -> publishing -> completed`
- Terminal alternatives: `needs_resolution`, `failed`, `completed_zero_data`, `completed_partial`
- Invalid: `completed` without a published `report_version`; `failed` with a published `report_version`; `completed_zero_data` with `claims` rows

### `source_snapshots`
- Statuses: `pending -> fetching -> captured`
- Terminal alternatives: `zero_data`, `provider_error`, `skipped`
- Invalid: `captured` with null `payload_object_key`; `provider_error` with null `error_code` and null `error_message`

### `analysis_runs`
- Statuses: `queued -> running -> succeeded`
- Terminal alternatives: `failed_model`, `failed_validation`
- Invalid: `succeeded` with null `output_object_key`; `failed_validation` with published report version attached

### `report_versions`
- Statuses: `drafting -> published`
- Terminal alternatives: `invalid`, `superseded`
- Invalid: `published` with null `report_object_key`; `superseded` without earlier `published_at`

### `artifacts`
- Statuses: `queued -> rendering -> available`
- Terminal alternative: `failed`
- Invalid: `available` with null `object_key`; `failed` with `available` checksum populated

## 7. Report JSON contract
Canonical `report.json` fields:
- `schema_version`
- `report_version_id`
- `report_run_id`
- `analysis_run_id`
- `generated_at`
- `published_at`
- `company`
- `snapshot`
- `model`
- `metrics`
- `executive_summary`
- `claims`
- `citations`
- `evidence_appendix`
- `methodology`
- `caveats`
- `integrity`

Exact shape:
- `company`: `company_id`, `display_name`, `canonical_name`, `website_domain`
- `snapshot`: `as_of_time`, `providers_queried[]`, `providers_succeeded[]`, `partial_data boolean`, `zero_data boolean`, `source_snapshot_ids[]`, `snapshot_window_start`, `snapshot_window_end`
- `model`: `provider`, `name`, `version`, `prompt_version`, `input_sha256`, `output_sha256`
- `metrics`: `total_jobs`, `department_counts[]`, `location_counts[]`, `recency_buckets[]`
- `executive_summary[]`: each item has `order`, `text`, `claim_refs[]`
- `claims[]`: each item has `claim_id`, `section`, `claim_type`, `statement`, `why_it_matters`, `confidence`, `support_status`, `citation_refs[]`
- `citations[]`: each item has `citation_id`, `claim_id`, `source_snapshot_id`, `normalized_job_id`, `provider`, `provider_job_id`, `job_url`, `job_title`, `department`, `location`, `source_posted_at`, `source_updated_at`, `snapshot_fetched_at`, `raw_record_path`, `raw_field_paths`, `evidence_sha256`
- `evidence_appendix[]`: deduplicated cited roles with full evidence card fields
- `methodology`: `providers`, `normalization_rules[]`, `analysis_constraints[]`
- `caveats[]`: each item has `type`, `text`
- `integrity`: `report_sha256`, `artifact_hashes`, `raw_payload_hashes`, `published_by_system_version`

HTML and PDF must render from this file only.

## 8. Publication validation rules
A report version publishes only if all are true:

1. `report_run.status` is not `needs_resolution` or `failed`.
2. At least one `source_snapshot` is terminal.
3. No `source_snapshot` remains non-terminal.
4. Every `captured` snapshot has `payload_object_key`, `payload_sha256`, and `record_count`.
5. If total normalized jobs is zero:
   - publish only `completed_zero_data`
   - `claims` must be empty
   - `executive_summary` must be factual only
   - `analysis_run` is optional in v1
6. If any provider failed but at least one succeeded:
   - publish only `completed_partial`
   - `snapshot.partial_data = true`
   - `caveats` must include provider failure details
7. If company resolution is ambiguous:
   - no publish
   - run becomes `needs_resolution`
8. If non-zero-data run has AI failure:
   - no publish in v1
   - run becomes `failed`
9. Every `claim` must have at least one `citation`.
10. Every `citation` must reference existing `normalized_job_id` and `source_snapshot_id`.
11. Every citation must include `raw_record_path`, `raw_field_paths`, and `evidence_sha256`.
12. `report.json` must validate against the canonical schema before HTML/PDF generation.

## 9. API contract redesign

| Route | Method | Input | Output | Auth | Path type |
|---|---|---|---|---|---|
| `/api/report-runs` | `POST` | `companyName`, optional `websiteDomain` | `reportRunId`, `companyId`, `status`, `statusUrl` | `owner` or `analyst` | Write |
| `/api/report-runs` | `GET` | optional `companyId`, `status`, cursor | paginated run summaries | `viewer+` | Read |
| `/api/report-runs/{reportRunId}` | `GET` | path only | run status, failure details, linked `reportVersionId` if complete | `viewer+` | Read |
| `/api/report-runs/{reportRunId}/retry` | `POST` | path only | new `reportRunId` | `owner` or `analyst` | Write |
| `/api/reports` | `GET` | optional `companyId`, cursor | report version summaries | `viewer+` | Read |
| `/api/reports/{reportVersionId}` | `GET` | path only | canonical report payload summary plus artifact availability | `viewer+` or valid share token | Read |
| `/api/reports/{reportVersionId}/artifacts/{artifactType}` | `GET` | `artifactType=html|pdf` | signed download URL or streamed response | `viewer+` or valid share token | Read |
| `/api/reports/{reportVersionId}/artifacts/{artifactType}/ensure` | `POST` | `artifactType=pdf` | existing artifact metadata or queued render status | `owner` or `analyst` | Write |
| `/api/share/{token}` | `GET` | share token | report payload limited to share scope | valid share token | Read |

## 10. Worker pipeline contract

| Step | Input | Output | Failure behavior | Retry behavior | Idempotency |
|---|---|---|---|---|---|
| Claim run | queued `report_run` | locked run | leave unclaimed if lock fails | immediate next loop | one lock token per run |
| Resolve company | `report_run`, `companies`, `company_provider_accounts` | resolved provider tokens or ambiguity | set `needs_resolution` | none until user retry | repeated execution must not create duplicate mappings |
| Fetch snapshots | resolved provider tokens | raw payload blobs plus `source_snapshots` | mark per-provider `provider_error` | retry transient provider/network failures up to fixed limit | unique `(report_run_id, provider, provider_token)` prevents duplicates |
| Normalize snapshots | captured snapshots | `normalized_jobs` rows plus derived metrics | fail run if normalization crashes | safe retry from same snapshots | unique `(source_snapshot_id, normalized_sha256)` |
| Decide data mode | normalized job count plus snapshot statuses | full, partial, or zero-data mode | fail if no successful snapshot exists | none | deterministic from DB state |
| Build analysis input | frozen normalized jobs | input blob plus `analysis_runs` row | fail run if input schema invalid | safe retry | unique `analysis_sequence` per run |
| Run AI | analysis input blob | output blob | mark `failed_model` | bounded retries on transient LLM failure | rerun creates next `analysis_sequence`, old run preserved |
| Validate analysis | raw model output | persisted `claims` plus `citations` or `failed_validation` | block publication | no automatic retry; requires new analysis run | validation is deterministic on stored output |
| Build canonical report | snapshots plus claims plus citations | `report.json` blob plus draft `report_version` | mark run failed | safe retry | object key deterministic by `report_version_id` |
| Publish report | validated draft report | `report_version.status='published'` | block if validation failed | safe retry | only one publish transition per version |
| Render HTML | published `report.json` | HTML artifact | artifact `failed` | retry without new run | unique `(report_version_id, html)` |
| Render PDF | HTML artifact or `report.json` | PDF artifact | artifact `failed` | retry without new run | unique `(report_version_id, pdf)` |
| Write audit | any state change | `audit_events` row | log error and continue only for non-critical events | no replay needed in v1 | append-only |

## 11. UI contract
- `/` becomes a report request form. It accepts company name, submits `POST /api/report-runs`, then redirects to `/report-runs/{id}`.
- `/report-runs/{id}` shows real run states: queued, resolving, fetching, analyzing, validating, publishing, completed, failed, needs resolution.
- `/reports/{reportVersionId}` shows immutable stored report content only.
- Evidence is shown as citation markers in narrative plus an evidence appendix table.
- Report metadata header must show `report_run_id`, `generated_at`, providers used, partial-data flag, zero-data flag, and artifact availability.
- Zero-data reports must say `No active jobs observed in captured snapshot.` No strategy language.
- Partial-data reports must show a visible warning banner with failed providers.

Remove immediately:
- `Institutional-grade` copy in metadata and UI until storage-backed reports are live
- `Evidence column` label from the current live page
- fixed `Data from Greenhouse & Lever` footer
- `SYSTEM: ONLINE` and `REGION: US-EAST` trust theater
- live latency as a credibility signal
- cached badges on product-facing report views

## 12. V1 scope cut
Build now:
- Postgres schema listed above
- S3 storage contract
- worker loop and report pipeline
- canonical `report.json`
- HTML and PDF artifacts
- Auth.js plus tenant memberships
- share links
- report request page
- run status page
- report detail page
- protected artifact downloads
- audit events

Do not build now:
- recurring monitoring scheduler
- email notifications
- side-by-side report diffs
- manual analyst editing
- SAML or SCIM
- MCP product integration
- vector search
- non-ATS scrapers
- usage analytics dashboards
- realtime dashboards as the core experience

## 13. Execution phases

| Phase | Purpose | Files or modules touched | Pass / fail | Depends on |
|---|---|---|---|---|
| 1 | Foundation | `src/lib/env.ts`, `src/db/*`, auth modules, storage modules | Pass: app can connect to Postgres and S3, auth works | none |
| 2 | Provider freeze path | refactor current ATS modules into `src/lib/providers/ats/*`, add `source_snapshots` and `normalized_jobs` writes | Pass: one report run can capture and persist raw plus normalized Airbnb data | 1 |
| 3 | Report run API plus worker | add `src/app/api/report-runs/*`, `src/worker/*`, `src/lib/reports/createReportRun.ts`, `claimNextReportRun.ts` | Pass: UI can create a queued run and worker can complete snapshot stage | 2 |
| 4 | Structured analysis | add `src/lib/analysis/*`, replace `unified-analyzer.ts` usage, add claims and citations persistence | Pass: a run produces validated claims and citations from frozen input | 3 |
| 5 | Publication | add `buildCanonicalReport.ts`, `publishReportVersion.ts`, `/api/reports/*`, report detail page | Pass: same report can be reopened with no live fetch and no AI call | 4 |
| 6 | Artifacts | add `renderReportHtml.ts`, `renderReportPdf.ts`, artifact routes | Pass: HTML and PDF are downloadable from stored artifacts only | 5 |
| 7 | UI cutover | refactor `src/app/page.tsx`, `src/components/truth/TruthConsole.tsx`, remove fake trust indicators | Pass: no product path returns live ATS-to-LLM answers | 6 |
| 8 | Cleanup | remove cache-backed product flow, retire `StratumInvestigator`, isolate MCP, delete secret-leaking script | Pass: cache-only demo path is no longer user-facing | 7 |

## 14. Acceptance checklist
Use this as a binary gate. If any required item is `No`, Stratum is still a demo.

- `Yes/No` A created report run gets a durable `report_run_id`.
- `Yes/No` Raw provider payloads are stored in object storage with checksums.
- `Yes/No` Normalized jobs are stored in Postgres with provider IDs, URLs, and raw record paths.
- `Yes/No` Viewing a report never calls a live ATS API.
- `Yes/No` Viewing a report never calls the LLM.
- `Yes/No` Every published claim has at least one persisted citation.
- `Yes/No` Every citation resolves to a stored normalized job and source snapshot.
- `Yes/No` A report can be reopened tomorrow and show the same content without recomputation.
- `Yes/No` HTML and PDF are generated from one stored canonical `report.json`.
- `Yes/No` Published artifacts have checksums stored in Postgres.
- `Yes/No` Provider failure is shown as partial-data or failed, not `unsupported company`.
- `Yes/No` Zero-job reports publish without invented strategy language.
- `Yes/No` Auth and tenant RBAC protect report access.
- `Yes/No` External executive sharing uses revocable protected links.
- `Yes/No` Audit events exist for run creation, publish, view, export, and share access.

If all required items are `Yes`, Stratum has crossed from live demo into a real report system.
