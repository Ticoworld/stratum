# Stratum Migration Blueprint

## 1. Product truth
Stratum today is a live ATS fetcher with an LLM summary layered on top. It produces transient answers from current job-board data and loses the evidence chain immediately.

Stratum must become an immutable report system. Evidence must be captured first, frozen, analyzed second, and rendered into durable HTML/PDF artifacts that can be reopened later without touching live providers or re-running the model.

## 2. Target product model
Primary model: immutable intelligence reports.

Why:
- Executive async sharing requires a stable artifact, not a live session.
- Reproducibility requires a frozen input set and a versioned output.
- Evidence traceability requires report-level IDs, citations, and artifacts.
- Recurring monitoring is just repeated report generation over time.
- Saved company workspaces are just containers for report history.

What this means:
- `report_version` is the product.
- `company workspace` is a list of report versions and monitoring schedules.
- `live dashboard` can remain as an internal preview mode, but it cannot be the product contract.

## 3. Minimum viable enterprise architecture
Keep the app as a monolith plus one worker. Do not build microservices yet.

### 3.1 Next.js app remains the control plane
It handles auth, report requests, report viewing, artifact downloads, and monitoring setup.

It does not fetch live ATS data on report view.

### 3.2 Postgres becomes the system of record
It stores companies, report runs, normalized jobs, analysis metadata, claims, citations, report versions, artifacts, and audit events.

It also holds the work queue state for report generation.

### 3.3 One background worker executes the pipeline
It claims queued `report_runs`, resolves provider identity, fetches raw payloads, stores raw snapshots, normalizes jobs, runs AI against frozen input, validates citations, publishes report versions, and renders artifacts.

### 3.4 Object storage becomes the blob store
It holds raw provider payloads, canonical analysis input JSON, raw model output JSON, canonical report JSON, rendered HTML, and PDFs.

### 3.5 PDF generation runs from stored report JSON only
The worker renders HTML from a stored `report_version` payload, then converts it to PDF with a headless browser.

PDF generation must never trigger a new ATS fetch or a new AI run.

### 3.6 Monitoring is implemented by inserting future `report_runs`
A scheduler creates new queued runs for watched companies on a cadence.

No separate monitoring service is needed at first.

### 3.7 Non-negotiable rule
- No live provider calls in the read path.
- No AI calls in the read path.
- A viewed report is always a stored version.

## 4. Canonical data model

| Entity | Purpose | Key fields | Mutable | Relationships |
|---|---|---|---|---|
| `companies` | Tenant-scoped target company records | `id`, `tenant_id`, `display_name`, `canonical_name`, `website_domain`, `resolution_status`, `notes`, `created_at`, `updated_at` | Yes | 1 company to many `report_runs`; 1 company to many `company_provider_accounts` |
| `company_provider_accounts` | Provider mappings and resolved ATS identifiers | `id`, `company_id`, `provider`, `provider_token`, `resolution_source`, `confidence`, `verified_at`, `last_success_at`, `last_failure_at` | Yes | Many mappings to 1 `company` |
| `report_runs` | One point-in-time attempt to generate a report | `id`, `tenant_id`, `company_id`, `requested_by_user_id`, `trigger_type`, `as_of_time`, `status`, `attempt_count`, `locked_at`, `locked_by`, `failure_code`, `failure_message`, `created_at`, `completed_at` | Mutable until terminal; then frozen | 1 run to many `source_snapshots`; 1 run to many `analysis_runs`; 1 run to many `report_versions` |
| `source_snapshots` | Immutable record of each provider fetch | `id`, `report_run_id`, `company_id`, `provider`, `provider_token`, `request_url`, `response_status`, `fetched_at`, `payload_object_key`, `payload_sha256`, `record_count`, `error_code`, `error_message` | No | Many snapshots to 1 `report_run`; 1 snapshot to many `normalized_jobs` |
| `normalized_jobs` | Immutable normalized jobs derived from a snapshot | `id`, `report_run_id`, `source_snapshot_id`, `provider`, `provider_job_id`, `requisition_id`, `job_url`, `title`, `department`, `location`, `employment_type`, `workplace_type`, `posted_at`, `updated_at`, `raw_record_path`, `normalized_sha256` | No | Many jobs to 1 `source_snapshot`; many jobs can be cited by many `citations` |
| `analysis_runs` | Immutable AI executions over frozen data | `id`, `report_run_id`, `prompt_version`, `model_provider`, `model_name`, `model_version`, `input_object_key`, `input_sha256`, `output_object_key`, `output_sha256`, `status`, `failure_code`, `created_at`, `completed_at` | Mutable until terminal; then frozen | 1 analysis to many `claims`; 1 analysis to many `report_versions` |
| `claims` | Atomic report statements | `id`, `analysis_run_id`, `section`, `claim_type`, `fact_status`, `statement`, `confidence`, `display_order`, `support_status` | No | Many claims to 1 `analysis_run`; 1 claim to many `citations` |
| `citations` | Links from claims to evidence | `id`, `claim_id`, `source_snapshot_id`, `normalized_job_id`, `provider`, `provider_job_id`, `job_url`, `job_title`, `source_posted_at`, `source_updated_at`, `raw_record_path`, `raw_field_paths`, `evidence_sha256`, `citation_order` | No | Many citations to 1 `claim`; each citation points to 1 `normalized_job` and 1 `source_snapshot` |
| `report_versions` | Immutable published report payloads | `id`, `report_run_id`, `analysis_run_id`, `version_number`, `template_version`, `status`, `report_object_key`, `report_sha256`, `generated_at`, `published_at`, `superseded_at` | Mutable until published; then immutable | 1 report version to many `artifacts` |
| `artifacts` | Immutable deliverables | `id`, `report_version_id`, `artifact_type`, `object_key`, `mime_type`, `byte_size`, `sha256`, `status`, `created_at` | Mutable until generated; then immutable | Many artifacts to 1 `report_version` |
| `audit_events` | Append-only audit trail | `id`, `tenant_id`, `actor_type`, `actor_id`, `entity_type`, `entity_id`, `action`, `occurred_at`, `request_id`, `ip_hash`, `metadata_json` | No | References any entity |
| `tenants` | Organization boundary | `id`, `name`, `slug`, `created_at` | Yes | 1 tenant to many `users`, `companies`, `report_runs`, `audit_events` |
| `users` | Authenticated identities | `id`, `email`, `name`, `auth_provider`, `external_subject`, `created_at` | Yes | Many users to many tenants via `memberships` |
| `memberships` | RBAC join table | `tenant_id`, `user_id`, `role`, `created_at` | Yes | Many memberships to 1 `tenant`, 1 `user` |
| `share_links` | Controlled async sharing | `id`, `report_version_id`, `token_hash`, `expires_at`, `revoked_at`, `created_by_user_id`, `access_scope` | Yes | Many share links to 1 `report_version` |

## 5. End-to-end sequence flows

### A. Generate new report
`User -> App`: request report for company
`App -> Postgres`: create `report_run(status='queued')`
`Worker -> Postgres`: claim queued run with lock
`Worker -> Postgres`: resolve `company_provider_accounts`
`Worker -> Provider API`: fetch raw ATS payload
`Worker -> Object Storage`: write raw payload blob
`Worker -> Postgres`: insert `source_snapshots` and `normalized_jobs`
`Worker -> Object Storage`: write canonical analysis input JSON
`Worker -> LLM`: run structured analysis on frozen input
`Worker -> Postgres`: insert `analysis_runs`, `claims`, `citations`
`Worker -> Object Storage`: write canonical report JSON
`Worker -> Postgres`: insert `report_versions`
`Worker -> Object Storage`: write HTML and PDF
`Worker -> Postgres`: insert `artifacts` and `audit_events`
`App -> User`: show completed immutable report version

### B. View existing report
`User -> App`: open report URL
`App -> Auth`: authorize tenant membership or share token
`App -> Postgres`: load `report_version`, `claims`, `citations`, artifact manifest
`App -> Object Storage`: fetch HTML or JSON payload if needed
`App -> User`: render stored report
No provider call. No AI call.

### C. Regenerate report on a later date
`User/Scheduler -> App`: request new run for same company
`App -> Postgres`: create new `report_run` with new `as_of_time`
`Worker`: repeat ingestion and analysis pipeline
`Worker -> Postgres`: publish new `report_version`
Old `report_versions` remain unchanged
`App -> User`: show version history and date-based comparison

### D. Export PDF
`User -> App`: request PDF
`App -> Postgres`: check for existing PDF artifact
If present: `App -> Object Storage`: issue download after auth
If absent: `App -> Postgres`: enqueue artifact job only
`Worker -> Object Storage`: read stored report JSON / HTML
`Worker -> PDF Renderer`: generate PDF
`Worker -> Object Storage`: store PDF
`Worker -> Postgres`: insert `artifacts`, `audit_events`
`App -> User`: return protected download

## 6. Storage design
Postgres:
- All structured entities
- company resolution state
- report lifecycle state
- normalized jobs
- claims and citations
- artifact manifests and hashes
- audit events
- share-link metadata

Object storage:
- raw provider payload blobs
- canonical analysis input JSON
- raw model output JSON
- canonical report JSON
- rendered HTML
- PDF files

Operational logs:
- send application logs to a log sink, not Postgres
- keep business and security audit events in `audit_events`
- do not store full raw provider payloads or PDFs inside Postgres

Opinionated storage rule:
- Postgres for queryable truth
- object storage for immutable blobs
- no MongoDB
- no vector DB
- no Redis requirement for v1 unless queue pressure forces it

Suggested object key layout:
- `raw/{tenant_id}/{company_id}/{report_run_id}/{provider}/{source_snapshot_id}.json`
- `analysis-input/{analysis_run_id}.json`
- `analysis-output/{analysis_run_id}.json`
- `reports/{report_version_id}/report.json`
- `reports/{report_version_id}/report.html`
- `reports/{report_version_id}/report.pdf`

## 7. Evidence model
Every rendered claim must reference one or more citations. No uncited claim can be published.

Citation object fields:
- `citation_id`
- `claim_id`
- `source_snapshot_id`
- `normalized_job_id`
- `provider`
- `provider_job_id`
- `job_url`
- `job_title`
- `department`
- `location`
- `source_posted_at`
- `source_updated_at`
- `snapshot_fetched_at`
- `raw_record_path`
- `raw_field_paths`
- `evidence_sha256`

Source anchor requirements:
- retain provider job ID if the provider exposes one
- retain canonical job URL if the provider exposes one
- retain raw JSON record path such as `jobs[17]`
- retain raw field paths used for the citation, such as `title`, `department`, `updated_at`
- retain snapshot fetch time and payload hash
- retain normalized row hash

UI display:
- main narrative uses footnote-style citation markers like `[1][2]`
- hover or side panel shows a compact evidence card with title, provider, location, timestamp, and link
- the full evidence appendix shows all cited jobs in a tabular form
- the PDF uses footnotes in the body and a role evidence appendix at the end
- do not dump raw JSON into the main report

## 8. AI analysis contract
Required input schema:
- `report_run_id`
- `company`
- `as_of_time`
- `provider_summary`
- `job_counts_by_department`
- `job_counts_by_location`
- `recency_buckets`
- `normalized_jobs[]`
- each job must include `normalized_job_id`, provider, provider job ID, title, department, location, posted_at, updated_at, job_url, source_snapshot_id

Required output schema:
- `executive_summary[]`
- `claims[]`
- `unknowns[]`
- `caveats[]`

Each `claim` must contain:
- `claim_id`
- `section`
- `claim_type` as `fact` or `inference`
- `statement`
- `confidence` as `high`, `medium`, or `low`
- `citation_refs[]`
- `why_this_matters`
- `limitations`

Allowed reasoning scope:
- summarize only the supplied frozen snapshot
- use only evidence contained in the input
- infer cautiously from hiring patterns
- describe uncertainty explicitly

Banned behavior:
- no external world knowledge
- no competitor comparisons unless supplied
- no future predictions stated as fact
- no unsupported macro narrative
- no uncited sentence in the executive summary
- no `proof` language unless the claim is a direct fact about cited job data

Banned wording patterns:
- `massive`
- `explosive`
- `game-changing`
- `obviously`
- `clearly`
- `undoubtedly`
- `poised to`
- `transformational`
- `dominant`
- `strong signal` without evidence detail

Confidence handling:
- `high` requires direct evidence across multiple citations or a direct count-based fact
- `medium` requires directional support but not full coverage
- `low` means plausible but weakly supported
- if support is below `low`, output `unknown`, not a claim

Unknown handling:
- if the evidence is sparse, mixed, stale, or incomplete, the model must say `unknown`
- unknowns must be surfaced in the report, not hidden

Publication rule:
- a report cannot publish if any claim references missing citations

## 9. Intelligence writing standard
System prompt requirements for Stratum:
- You are an evidence-bound corporate intelligence analyst briefing a CFO, partner, or corp dev lead.
- Use only the supplied snapshot. Treat all missing context as unknown.
- Write in short boardroom sentences. No hype. No consumer-product tone.
- Separate direct facts from inference. Facts describe what the snapshot shows. Inference explains what the pattern may imply.
- Every summary sentence must map to one or more claim IDs.
- Every claim must cite the exact job records that support it.
- If a conclusion is weakly supported, downgrade confidence or mark it unknown.
- Never invent strategy, urgency, market position, or future direction that is not supported by cited roles.
- Avoid adjectives unless they carry measurable meaning.
- Use verbs like `shows`, `indicates`, `suggests`, and `does not establish`.
- Never use `clearly`, `obviously`, `massive`, `huge`, `explosive`, or `transformational`.
- If the evidence only supports a narrow statement, keep the statement narrow.
- If citations are incomplete, refuse to finalize the analysis.

## 10. PDF and report requirements
Required report structure:

### 10.1 Cover
- company name
- report title
- `report_version_id`
- `report_run_id`
- `generated_at`
- confidentiality label
- tenant name
- checksum short form

### 10.2 Report metadata block
- source providers used
- provider identifiers used
- snapshot fetch window
- model name and prompt version
- template version
- data freshness statement

### 10.3 Executive summary
- 3 to 5 sentences max
- every sentence traceable to claims

### 10.4 Key claims
- claim statement
- fact or inference label
- confidence
- citation markers

### 10.5 Hiring evidence summary
- role counts
- department mix
- geography mix
- recency buckets
- provider coverage notes

### 10.6 Claim detail pages
- each claim with short rationale
- citation list under each claim

### 10.7 Role evidence appendix
- cited roles only
- provider
- title
- department
- location
- posted or updated timestamp
- source URL
- provider job ID

### 10.8 Methodology
- providers queried
- snapshot methodology
- normalization rules
- analysis constraints
- what the system does not know

### 10.9 Caveats and unknowns
- provider limitations
- ambiguous company resolution
- stale timestamps
- zero-data conditions

### 10.10 Integrity footer on every page
- `report_version_id`
- page number
- artifact checksum short form

Integrity marker:
- compute SHA-256 for canonical `report.json`
- store full hash in `report_versions`
- stamp short hash on PDF and HTML footer
- PDF and HTML must derive from the same canonical report JSON

## 11. Failure-state design

| Failure state | Required system behavior |
|---|---|
| Provider is down | Create `source_snapshot` with error metadata, mark `report_run` as `failed_provider` or `partial_data`, emit audit event, do not say `no job board found` |
| Provider returns zero jobs | Publish a zero-data report only if company resolution is confirmed; report states `No active jobs observed in captured snapshot`; no strategy claims |
| Company resolution is ambiguous | Set `report_run` to `needs_review`; require user or analyst selection of provider token before fetch; do not auto-publish |
| AI fails | Preserve snapshots and normalized jobs; mark `analysis_run` failed; allow manual retry against frozen input; optionally publish an evidence-only report without narrative |
| Artifact generation fails | Keep `report_version` valid; mark PDF artifact failed; allow retry without new fetch or new analysis |
| Citations are incomplete | Fail validation; keep report in `draft_invalid`; block sharing and PDF publication |

## 12. Security and enterprise controls
Minimum controls:
- Auth: authenticated users only for report generation. Use OIDC now. Be SAML-ready later.
- RBAC: `owner`, `analyst`, `viewer`.
- Tenant isolation: every tenant-owned row carries `tenant_id`; enforce Postgres row-level security.
- Audit logs: append-only `audit_events` for run creation, view, export, share, revoke, retry, publish, and delete.
- Secret handling: all provider and model secrets in a secrets manager; never in repo; rotate the exposed key immediately.
- Rate limits: separate limits for report generation, artifact export, and share-link access; enforce per user, tenant, and IP.
- Artifact access: HTML and PDF downloads require auth or a revocable share token.
- Signed URLs: object storage URLs are short-lived and issued only after authorization.
- Share links: token stored hashed, optional expiry, revocable, read-only to a single immutable `report_version`.
- Data deletion: deleting a company should not mutate published report history without an explicit retention policy.

## 13. Build order
1. Stop caching `jobs.length === 0` and provider-error results. Surface provider outages distinctly from unsupported companies.
2. Persist raw ATS payloads and normalized jobs with provider IDs, URLs, descriptions, and fetch timestamps.
3. Add `report_run` and `report_version` records that store prompt version, model version, normalized input snapshot, and full model output.
4. Add citation objects that link each rendered claim to exact source job IDs, titles, and URLs.
5. Render reports from persisted versions and add PDF and share export on top of that.
6. Add auth, audit logs, and access controls. Only after this should enterprise positioning resume.

## 14. Brutal tradeoff analysis
Do not build yet:
- chatbot interfaces
- real-time dashboards as the product core
- vector search
- cross-provider web scraping beyond supported ATS APIs
- fancy analytics and observability dashboards
- collaborative annotations

Can remain fake temporarily:
- the live dashboard can survive as an internal analyst preview
- monitoring emails can be manual at first
- provider auto-resolution can stay partially manual
- diffing between runs can be basic before becoming polished

Must be real before any enterprise sales claim is credible:
- immutable `report_runs`
- raw source snapshot storage
- normalized job storage with source anchors
- AI analysis over frozen inputs only
- persisted claims and citations
- immutable `report_versions`
- HTML and PDF artifacts
- audit events
- tenant auth and protected sharing

If those are not real, Stratum is still a demo with nicer copy.
