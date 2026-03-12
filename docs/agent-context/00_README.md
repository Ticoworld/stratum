# Agent Context Handoff Pack

This folder is the canonical handoff pack for future Codex sessions working on Stratum.

Read every file in this folder before making design or implementation decisions. These files preserve the completed audit, the approved migration blueprint, the approved implementation spec, and the exact current repo status after Phase 1.

## File map
- `00_README.md`: explains this handoff pack and the current repo state.
- `01_PROJECT_TRUTH.md`: blunt product truth and why the old model is not enterprise-safe.
- `02_CODEBASE_AUDIT.md`: the completed forensic audit of the original Stratum codebase and live data flow.
- `03_MIGRATION_BLUEPRINT.md`: the approved target product and architecture blueprint.
- `04_IMPLEMENTATION_SPEC.md`: the repo-grounded execution spec for the approved architecture.
- `05_PHASE_STATUS.md`: exact status after Phase 1 implementation.
- `06_ENV_AND_INFRA_DECISIONS.md`: current env, infra, and setup decisions that affect command execution.
- `07_PHASE_2_BRIEF.md`: the exact working brief for the next implementation phase only.
- `08_CANONICAL_DECISIONS.md`: approved decision register.
- `09_NEXT_CODEX_START_PROMPT.md`: startup prompt for a new Codex session.
- `10_MACHINE_SUMMARY.json`: machine-readable summary for automation or fast session bootstrapping.

## Current repo status
- Phase 1 foundation is complete.
- Central env handling exists in `src/lib/env.ts`.
- PostgreSQL + Drizzle foundation exists.
- Minimal auth foundation exists with Auth.js + Google OIDC.
- Minimal tenant, user, and membership tables exist and were migrated.
- Optional S3 client scaffolding exists, but S3 is not required in Phase 1.
- The original ATS-to-LLM dashboard behavior is still the product path.
- No immutable report system exists yet.
- No Phase 2 or later product architecture has been implemented yet.
- The next approved phase is Phase 2 only.
