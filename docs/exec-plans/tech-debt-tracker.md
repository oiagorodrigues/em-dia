# Tech debt tracker

Deferred work with no plan yet. Add a row when you skip something on purpose; remove it when it ships.

| Item                                                    | Area    | Why deferred                                   | Added      |
| ------------------------------------------------------- | ------- | ---------------------------------------------- | ---------- |
| Queue offline writes with conflict handling             | web     | Needs a design for dual confirmation conflicts | 2026-10-06 |
| Money-field check in harness (`*Cents` must be numbers) | harness | Needs a type-aware check; regex is too fuzzy   | 2026-10-06 |
| Email delivery through a real provider                  | api     | MVP logs mail and exposes `/dev/outbox`        | 2026-10-06 |
