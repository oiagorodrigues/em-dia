# Plans

Execution plans are versioned files in the repo. They carry the state of ongoing work so any agent can resume it.

## Layout

- `docs/exec-plans/active/NNNN-name.md`: work in progress.
- `docs/exec-plans/completed/`: plans moved here when every checkbox is ticked or explicitly dropped.
- `docs/exec-plans/tech-debt-tracker.md`: deferred work that has no plan yet.

## Plan format

Every active plan has these sections, in this order:

1. `## Goal`: one paragraph.
2. `## Scope`: feature checklist with `- [ ]` and `- [x]` boxes, grouped by area.
3. `## Decision log`: dated lines, one decision each, with the reason.
4. `## Status`: current state and the next step. Required; the harness fails without it.

## Working with a plan

- Read the plan before starting. Pick an unchecked item.
- Tick the box in the same change that finishes the item.
- Record a decision before acting on it when the plan or specs are silent or ambiguous.
- Do not rewrite history in the decision log; append.

## Doc gardening

Docs rot unless something checks them. `tools/harness/tests/docs.test.ts` fails when a relative link breaks, when AGENTS.md exceeds 120 lines, or when an active plan has no Status section. On a recurring basis (weekly, or at the end of each plan):

- Run `vp run -r test` and fix doc failures.
- Compare [QUALITY_SCORE](QUALITY_SCORE.md) with reality and re-grade.
- Check the SECURITY control statuses against the code.
- Regenerate `docs/generated/db-schema.md` with `bun run docs:schema`.
- Move finished plans to `completed/` and prune the tech debt tracker.
