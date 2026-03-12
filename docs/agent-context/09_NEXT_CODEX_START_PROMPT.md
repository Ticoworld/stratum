# Next Codex Start Prompt

Read every file in `docs/agent-context/` before doing anything else.

Treat those files as source truth for Stratum. Do not redesign the system. Do not revisit the product model unless you find a direct contradiction in the repo that invalidates the documented source truth.

Phases 1, 2, 3, 4, 5, and 6 are already complete. Do not redo them. Do not remove or bypass the completed foundation, provider freeze path, report-run worker foundation, structured analysis layer, publication layer, or artifact layer.

Continue with the next approved phase only. Stay inside the documented scope, guardrails, and pass/fail criteria for that phase.

The next approved phase is Phase 7. Do not drift into Phase 8 or later. Do not add cleanup or later-phase scope unless the current approved phase explicitly requires it.

Before editing code:
- read `00_README.md`
- read `05_PHASE_STATUS.md`
- read `07_PHASE_2_BRIEF.md` as historical context only
- read `08_CANONICAL_DECISIONS.md`

When in doubt:
- prefer the approved implementation spec over ad hoc invention
- preserve existing documented decisions
- state contradictions explicitly instead of silently changing direction
