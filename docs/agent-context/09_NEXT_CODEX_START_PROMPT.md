# Next Codex Start Prompt

Read every file in `docs/agent-context/` before doing anything else.

Treat those files as source truth for Stratum. Do not redesign the system. Do not revisit the product model unless you find a direct contradiction in the repo that invalidates the documented source truth.

Phases 1, 2, 3, 4, 5, 6, 7, and 8 are already complete. Do not redo them. Do not remove or bypass the completed foundation, provider freeze path, report-run worker foundation, structured analysis layer, publication layer, artifact layer, the Phase 7 product-facing UI cutover, or the Phase 8 cleanup removals.

Phase 8 is also complete. Do not redo it. The live compatibility shim, cache-backed demo orchestration path, and legacy MCP entrypoint have already been retired.

No next phase is approved in this handoff pack. Do not invent Phase 9 or later work without new source material.

Before editing code:
- read `00_README.md`
- read `05_PHASE_STATUS.md`
- read `07_PHASE_2_BRIEF.md` as historical context only
- read `08_CANONICAL_DECISIONS.md`

When in doubt:
- prefer the approved implementation spec over ad hoc invention
- preserve existing documented decisions
- state contradictions explicitly instead of silently changing direction
