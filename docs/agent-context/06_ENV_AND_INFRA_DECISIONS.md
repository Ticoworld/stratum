# Env And Infra Decisions

## Current env decisions
Phase 1 introduced a central env module at `src/lib/env.ts`. It validates only the new Phase 1 foundation variables and deliberately does not absorb the legacy ATS/AI env surface.

That isolation was intentional. Existing non-Phase-1 code still reads `process.env` directly. The goal was to add foundation infrastructure without breaking the legacy live dashboard path.

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
These exist because the old ATS-to-LLM product path still exists. They are not part of the Phase 1 foundation contract.

- `GEMINI_API_KEY`
- `STRATUM_CACHE_TTL_HOURS`
- `MONGODB_URI`

## Later-phase env vars
These become materially important in later phases but are not required to complete Phase 1.

- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `STRATUM_S3_BUCKET`
- `GEMINI_API_KEY`

Interpretation:
- AWS values become effectively required once raw source snapshots and artifacts are written.
- `GEMINI_API_KEY` becomes required when the new structured analysis phase is implemented.

## Setup notes future Codex sessions must know
- `drizzle.config.ts` loads `.env.local` first and `.env` second.
- Next.js build also loads `.env.local`.
- `src/lib/env.ts` validates only the Phase 1 foundation surface and leaves legacy env usage alone.
- If AWS vars are set partially, `src/lib/env.ts` throws when S3 config is requested.
- `npm run db:generate` and `npm run db:migrate` hit Windows sandbox `spawn EPERM` and may require escalation.
- Google sign-in requires a valid Google OAuth app with callback URLs configured for the environment being tested.
