# Env And Infra Decisions

## Current env decisions
Phase 1 introduced a central env module at `src/lib/env.ts`. It validates the infrastructure/report-system env surface and deliberately avoided destabilizing the legacy dashboard path during migration.

That isolation was intentional during migration. Phase 8 removed the remaining legacy cache-backed dashboard path, but the central env module remains the binding place for report-system env validation.

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
Approved decision:
- object storage is part of the target architecture
- S3 client setup exists in Phase 1
- AWS env vars are not required in Phase 1

Implemented behavior:
- `src/lib/storage/s3.ts` exists
- `src/lib/env.ts` treats S3 env as optional
- empty AWS strings are normalized to `undefined`
- missing AWS values do not fail build, typecheck, or migration commands

Future sessions must keep that contract until the storage-writing phase actually begins.

## Required env vars now
- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`

## Optional now
- `NEXT_PUBLIC_SITE_URL`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `STRATUM_S3_BUCKET`

## Legacy env vars
The old cache-backed ATS-to-LLM product path has been removed.

Remaining non-foundation env items are:
- `GEMINI_API_KEY` for structured analysis
- `MONGODB_URI` as leftover legacy env surface not used by the report product path

## Later-phase env vars
These become materially important in later phases but are not required to complete Phase 1.

- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `STRATUM_S3_BUCKET`
- `GEMINI_API_KEY`

Interpretation:
- AWS values become effectively required once raw source snapshots and artifacts are written.
- `GEMINI_API_KEY` is required for the structured analysis path.

## Setup notes future Codex sessions must know
- `drizzle.config.ts` loads `.env.local` first and `.env` second.
- Next.js build also loads `.env.local`.
- `src/lib/env.ts` remains the central env module for the report product path.
- If AWS vars are set partially, `src/lib/env.ts` throws when S3 config is requested.
- `npm run db:generate` and `npm run db:migrate` hit Windows sandbox `spawn EPERM` and may require escalation.
- Google sign-in requires a valid Google OAuth app with callback URLs configured for the environment being tested.
