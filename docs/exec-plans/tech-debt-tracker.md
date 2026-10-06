# Tech debt tracker

Deferred work with no plan yet. Add a row when you skip something on purpose; remove it when it ships.

| Item                                                    | Area    | Why deferred                                                                                                                                                                                              | Added      |
| ------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Queue offline writes with conflict handling             | web     | Needs a design for dual confirmation conflicts                                                                                                                                                            | 2026-10-06 |
| Money-field check in harness (`*Cents` must be numbers) | harness | Needs a type-aware check; regex is too fuzzy                                                                                                                                                              | 2026-10-06 |
| Move to TypeScript 7                                    | all     | vue-tsc 3.3.12 needs the TS JS API that TS 7.0 lacks ([vuejs/language-tools#5381](https://github.com/vuejs/language-tools/issues/5381)); vue-tsgo 0.3.0 mistypes generic components. Revisit after TS 7.1 | 2026-10-06 |
