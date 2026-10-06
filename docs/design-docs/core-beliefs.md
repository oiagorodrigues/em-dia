# Core beliefs

Operating principles for working in this repo, mostly for agents.

- The repo is the system of record. Anything not in a file in this repo does not exist for the next agent. Write decisions down.
- AGENTS.md is a map, not a manual. Keep it short and link to `docs/`.
- Enforce with machines, not with prose. If a rule matters, a test in `tools/harness` checks it, and its failure message says WHAT is wrong, HOW to FIX it and where the REFerence doc is.
- Fix the rule's cause, not the rule. When a harness test fails, follow the FIX text. Weaken a rule only with a decision-log entry explaining why.
- Contract first. Shapes live in `@emdia/shared`; api and web follow.
- Boring technology. Prefer what the platform ships (`node:sqlite`, `fetch`, `<dialog>`) over a new dependency.
- Small, verifiable steps. Run `vp check` and the tests after each change; do not stack unverified work.
- Plans are artifacts. Work is tracked in `docs/exec-plans`, with checkboxes and a decision log.
- Measure the gaps. [QUALITY_SCORE](../QUALITY_SCORE.md) is updated with every change that moves a grade.
- Garden continuously. Stale docs are bugs; the doc tests and the recurring gardening pass in [PLANS](../PLANS.md) catch them.
- Verify before dismissing. A failing test or warning is not "pre-existing" until checked against history.
