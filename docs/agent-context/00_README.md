# Agent Context Handoff Pack

This folder is the canonical handoff pack for future Codex sessions working on Stratum.

Read every file in this folder before making design or implementation decisions. These files preserve the completed audit, the approved migration blueprint, the approved implementation spec, and the exact current repo status through the latest completed migration phase.

## File map
- `00_README.md`: explains this handoff pack and the current repo state.
- `01_PROJECT_TRUTH.md`: blunt product truth and why the old model is not enterprise-safe.
- `02_CODEBASE_AUDIT.md`: the completed forensic audit of the original Stratum codebase and live data flow.
- `03_MIGRATION_BLUEPRINT.md`: the approved target product and architecture blueprint.
- `04_IMPLEMENTATION_SPEC.md`: the repo-grounded execution spec for the approved architecture.
- `05_PHASE_STATUS.md`: exact status through the latest completed migration phase.
- `06_ENV_AND_INFRA_DECISIONS.md`: current env, infra, and setup decisions that affect command execution.
- `07_PHASE_2_BRIEF.md`: the exact working brief for the next implementation phase only.
- `08_CANONICAL_DECISIONS.md`: approved decision register.
- `09_NEXT_CODEX_START_PROMPT.md`: startup prompt for a new Codex session.
- `10_MACHINE_SUMMARY.json`: machine-readable summary for automation or fast session bootstrapping.

## Current repo status
- Phases 1 through 7 are complete.
- Central env handling exists in `src/lib/env.ts`.
- PostgreSQL + Drizzle foundation exists.
- Minimal auth foundation exists with Auth.js + Google OIDC.
- The provider freeze path exists for raw ATS payload capture and normalized job persistence.
- Report-run orchestration and worker snapshot execution exist.
- Structured analysis exists for frozen-input report runs.
- Claims and citations exist as part of the structured analysis phase.
- The product-facing UI now follows the stored report system path instead of the old live ATS-to-LLM demo flow.
- A published immutable report read path exists.
- HTML and PDF artifact generation and protected retrieval now exist.
- A real report-run status page now exists.
- The next approved phase is Phase 8 only.
