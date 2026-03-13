# Canonical Decisions

## Decision register

| Decision | Status | Reason | Consequences | Phase introduced |
|---|---|---|---|---|
| Immutable reports are the product | approved | Live sessions are not reproducible or shareable with executive trust | The system must publish durable `report_version` artifacts instead of transient dashboard responses | Migration blueprint |
| No live ATS or AI calls on the report read path | approved | A viewed report must be reproducible and stable | Report detail and export routes must read stored artifacts only | Migration blueprint |
| PostgreSQL + Drizzle | approved | Smallest serious relational foundation that fits the current TypeScript repo | Schema and migration work are centered on Drizzle with a PostgreSQL `DATABASE_URL` | Implementation spec, Phase 1 |
| Postgres-backed queue | approved | Avoid extra infra in v1 while preserving durable job claiming | Future worker job claiming will use database row claiming, not a separate queue product in v1 | Implementation spec |
| Object storage for raw payloads and artifacts | approved | Raw ATS payloads, report JSON, HTML, and PDFs are blobs, not relational rows | Future phases must store immutable payload and artifact blobs outside Postgres | Migration blueprint / implementation spec |
| Auth.js + Google OIDC | approved | Smallest serious auth foundation for the current Next.js app | Auth is now JWT-based and Google-backed; tenant/user bootstrap exists | Implementation spec, Phase 1 |
| Zod validation | approved | Existing repo already uses Zod and needs strict input/output contracts | Env, API, AI IO, and report JSON validation should stay on one validation stack | Implementation spec, Phase 1 for env |
| Playwright PDF rendering | approved | One HTML-to-PDF path should derive from the canonical report payload | Future PDF export must render from stored report JSON / HTML, not new live computation | Migration blueprint / implementation spec |
| Strangler migration strategy | approved | Replacing the live product in one cut is risky and unnecessary | The current ATS adapters can be refactored gradually while the old path remains until cutover | Implementation spec |
| Citations required for publication | approved | Enterprise reporting without evidence chains is not credible | No report version may publish if claims lack complete citations | Migration blueprint / implementation spec |
| Central env validation must not break the legacy live dashboard path | approved | Phase 1 had to add foundation infra without destabilizing the current product flow | `src/lib/env.ts` validates only the new foundation surface; legacy modules still use `process.env` directly | Phase 1 |
| AWS / S3 is optional in Phase 1 | approved | S3 writing is not used yet and should not block the foundation phase | Empty or missing AWS env vars must not fail build or migration commands in Phase 1 | Phase 1 |
| Web and worker are separate deployment roles | approved | A web deployment without a worker is not a healthy production system | Deployment docs, scripts, and runtime checks must describe and validate web vs worker responsibilities separately | Phase C |
| Report creation must be blocked when the worker dependency is not healthy | approved | Accepting report requests without an active worker creates fake healthy deployment states | The web app must refuse report creation and explain why when the worker heartbeat is missing or stale | Phase C |
| Deployment readiness should be minimal and honest | approved | Operators need clarity, not another fake dashboard | Expose a small readiness surface that reports web up, worker heartbeat state, and whether report creation is actually safe | Phase C |
