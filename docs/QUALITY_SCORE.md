# Quality score

Grades per domain and layer: A (done, tested, documented), B (works, minor gaps), C (works, notable gaps), D (partial), F (missing). `-` means the layer does not apply. Graded after the MVP landed.

| Domain                 | shared | db  | repos | services | http | stores | components | views | tests | docs |
| ---------------------- | ------ | --- | ----- | -------- | ---- | ------ | ---------- | ----- | ----- | ---- |
| Auth and RBAC          | A      | A   | B     | A        | A    | B      | B          | B     | A     | B    |
| Contracts and invites  | A      | A   | B     | A        | A    | -      | B          | B     | B     | B    |
| Team management        | A      | A   | B     | A        | A    | -      | B          | B     | B     | B    |
| Agreements and account | A      | A   | B     | A        | A    | -      | B          | B     | B     | B    |
| Time card and clock    | A      | A   | B     | A        | A    | -      | B          | B     | B     | B    |
| Adjustments            | A      | A   | B     | A        | A    | -      | B          | B     | B     | B    |
| Payments and receipts  | A      | A   | B     | A        | A    | -      | B          | B     | B     | B    |
| Summary and statement  | A      | -   | B     | A        | A    | -      | B          | B     | B     | B    |
| Activity log           | -      | A   | B     | B        | B    | -      | B          | B     | C     | B    |
| Dashboard              | -      | -   | B     | B        | B    | -      | B          | B     | B     | B    |
| PWA and offline        | -      | -   | -     | -        | B    | -      | B          | B     | C     | B    |
| Security               | B      | A   | B     | A        | A    | B      | B          | -     | A     | B    |
| Reliability            | -      | B   | -     | -        | B    | -      | -          | -     | C     | B    |

Evidence at grading time (2026-10-06): api 199 tests (supertest: RBAC, auth, entries, payments, reports, team, agreements, account deletion, static serving), web 159 tests plus `vue-tsc`, shared 38, harness 18, 25 browser journeys defined in `tools/e2e` (pass results pending: not re-run when this was written). Repos are graded B because they are tested only through services and http.

## Gaps

List each gap under the grade that caused it. Keep entries short and link to the tech debt tracker when a fix is deferred.

- Reliability tests (C): no backup or restore procedure is automated or tested. Planned in [0002](exec-plans/active/0002-next.md).
- PWA tests (C): offline reads and the update prompt are checked by hand and by e2e navigation, with no unit tests for the service worker flow.
- Activity tests (C): audit rows are asserted for some mutations, not every endpoint. Two controls stay at `implemented` in [SECURITY](SECURITY.md).
- Web components (B): unit tests cover `DataTable`, `MoneyInput`, table state, `TimeCard`, the api client, the query cache layer (`useResource`, invalidation) and the router guard; most forms are covered only through the e2e journeys.
- Mail: SMTP transport exists but is only tested against the dev outbox, not a real server.
- Accessibility: no automated audit (axe) yet; checked by design rules only.

## How to update

1. After a change, find the domain row and the layer column you touched.
2. Re-grade it honestly against the acceptance criteria in [features](product-specs/features.md) and the controls in [SECURITY](SECURITY.md).
3. Add or remove a line under Gaps. A grade below B needs a gap line.
4. If you defer a fix, add it to the [tech debt tracker](exec-plans/tech-debt-tracker.md).
5. Update this file in the same change as the code.
