# Deployment Readiness Checklist

This is the final rollout gate for Stratum.

## No-go

Deployment is `no-go` if any of the following is true:

- `DATABASE_URL` is missing or the database is unreachable.
- Web auth env is missing: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, or `NEXT_PUBLIC_SITE_URL`.
- Shared object storage env is missing: `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or `STRATUM_S3_BUCKET`.
- Worker-only env is missing: `GEMINI_API_KEY`.
- `npm run worker:check-env` fails.
- `/api/deployment/readiness` reports `reportCreation.ready: false` because the worker heartbeat is missing or stale.
- The web build fails.
- The worker cannot start and write a heartbeat.

## Partial

Deployment is `partial` if all of the following are true:

- The web app is reachable.
- Auth works.
- Stored published reports can still be read.
- `/api/deployment/readiness` responds.

And any of the following is also true:

- The worker is not deployed yet.
- The worker heartbeat is stale.
- Report creation is blocked.
- Artifact retrieval or generation is blocked by missing shared storage config.

`Partial` is acceptable for internal staging, smoke testing, or documentation review only. It is not production-ready.

## Go

Deployment is `go` only when all of the following are true:

- Web runtime env is complete.
- Worker runtime env is complete.
- Shared infrastructure env is complete.
- `npx tsc --noEmit` passes.
- `npm run lint` passes.
- `npm run build` passes.
- `npm run worker:check-env` passes on the worker host.
- The worker process starts successfully.
- The worker writes a fresh heartbeat row to `worker_heartbeats`.
- `/api/deployment/readiness` reports:
  - `webApp.status = "up"`
  - `sharedInfrastructure.database.reachable = true`
  - `sharedInfrastructure.objectStorage.configured = true`
  - `workerRuntime.heartbeat.status = "running"`
  - `reportCreation.ready = true`

If any of those conditions is not true, the rollout is not `go`.
