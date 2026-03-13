# Env And Infra Decisions

## Current env decisions
Phase 1 introduced a central env module at `src/lib/env.ts`.

Phase C changed the contract from a single mixed validation surface into explicit role-based contracts:
- shared required
- web-only required
- worker-only required
- optional/local-only

The central env module remains binding truth for runtime validation.

## PostgreSQL vendor note
Approved and implemented: generic PostgreSQL via `DATABASE_URL`, accessed through Drizzle and `postgres`.

Not established in the approved source material: a specific hosted vendor such as Neon.

Important rule for future sessions:
- Do not assume Neon-specific features.
- Treat the current implementation as vendor-agnostic PostgreSQL.
- If Neon is later selected explicitly, that is a new decision and must be recorded as such.

## Auth foundation decision
Approved and implemented:
- Auth.js
- Google OIDC
- JWT session strategy
- minimal tenant/user/membership bootstrap on first sign-in

This foundation is present in:
- `src/auth.ts`
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/lib/auth/bootstrapUser.ts`
- `src/lib/auth/session.ts`

## AWS / S3 decision
Approved and implemented:
- object storage is part of the target architecture
- raw payload capture and artifact retrieval both depend on private S3-compatible storage
- web and worker runtimes both depend on the same object storage contract for full production behavior

Implemented behavior:
- `src/lib/storage/s3.ts` fails with direct errors when object storage is actually used without required env
- worker startup validates object storage before entering the loop
- deployment readiness reports whether object storage is configured

## Required env vars now

### Shared required
- `DATABASE_URL`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `STRATUM_S3_BUCKET`

### Web-only required
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `NEXT_PUBLIC_SITE_URL`

### Worker-only required
- `GEMINI_API_KEY`

### Optional / local-only
- `STRATUM_S3_ENDPOINT`
- `R2_ENDPOINT`
- `STRATUM_ANALYSIS_RETRY_PROOF_FAILURES`

## Setup notes future Codex sessions must know
- `drizzle.config.ts` loads `.env.local` first and `.env` second.
- Next.js build also loads `.env.local`.
- `src/lib/env.ts` remains the central env module for the report product path.
- The web runtime can build without worker-only env at import time, but report creation is blocked until the worker dependency is healthy.
- The worker runtime must pass `npm run worker:check-env` before production rollout.
- The web runtime exposes `/api/deployment/readiness` and uses worker heartbeat freshness to decide whether report creation is safe.
- Google sign-in requires a valid Google OAuth app with callback URLs configured for the environment being tested.
