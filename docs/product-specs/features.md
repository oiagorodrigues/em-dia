# Features

Acceptance criteria per role. Endpoints are in [api-contract](api-contract.md); screens in [DESIGN](../DESIGN.md#layout). E = employer, W = worker.

## Auth and accounts

- E and W can register with name, email and password; E gets a household "Minha casa". W may enter an invite code at registration.
- Login with wrong credentials shows one generic message. After 5 consecutive failures the account locks for 15 minutes and the UI says so.
- Session survives a page reload (silent refresh). "Sair de todos os dispositivos" ends every session.
- Forgot password always shows the same confirmation. A reset link works once, within 30 minutes, and ends all sessions.
- Profile: both edit name and phone; W edits the Pix key; both change password and theme.

## Contracts and invites

- E creates a contract with name, occupation, pay type, rate, an agreed schedule (see Frequência e combinado), expected times and start date, and gets an 8-character invite code plus a shareable link.
- E can edit a contract, regenerate the code (the old one stops working) and end the contract with an end date.
- W joins with the code. An invalid or expired code gives "not found". W sees only contracts they are linked to.
- E sees the worker's Pix key on the contract page with a copy button.

## Frequência e combinado

The contract carries an agreed schedule (`weekly`, `month_days`, `per_month` or `on_demand`) and, for monthly pay, a "descontar faltas" switch. Rules and field shapes: [api-contract](api-contract.md#contracts-vínculos). Counting and wording come from `schedule.ts` in `@emdia/shared`; api and web never reimplement them.

Acceptance criteria:

- E picks one kind when creating or editing a contract and sees a short pt-BR description of the result (for example "seg, qua e sex", "quinzenal: sex", "todo dia 5", "2x por mês", "quando precisar"). W sees the same text.
- weekly: E picks weekdays and every how many weeks (1 or 2 and up to 4). Expected days are those weekdays in the month, in weeks that match, counting from the Monday-starting week of the start date. "Todos os dias" is all seven weekdays.
- month_days: E picks days 1 to 31. In a short month a day past its end falls on the last day. Days outside the contract period are not expected.
- per_month: E gives a number of visits per month. No dates are expected; the month shows "N de M vezes" and nothing is flagged as unrecorded.
- on_demand: nothing is expected, nothing is flagged, days are recorded as they happen.
- Expected days with no entry appear as "registrar" placeholders on the card and count in the unrecorded warning on the dashboard. Days that are not expected can still be recorded.
- Editing the schedule replaces it as a whole, clears fields that do not belong to the new kind, and does not touch entries already recorded.
- Bulk fill (most useful for mensalista): when expected days in the past have no entry, E sees a notice with the count and a "marcar como trabalhados" button. It opens the sheet "marcar dias previstos", with entrada and saída prefilled from the contract's expected times, an editable pausa, and the per-day total times the number of days. Confirming creates one `worked` entry per day, one request each, so the activity log shows each day. Existing entries are never overwritten, so absences and days off must be marked before. Progress is shown and can be stopped; if some days fail, the count saved and the count failed are reported. W sees the new entries as unconfirmed and can confirm them.
- Mensalista with "descontar faltas": each unjustified absence (`absent`) subtracts salário ÷ 30 (rounded to cents) in the summary and statement, shown as its own line. Excused, day off and holiday never deduct. With the switch off, absences do not change the amount.
- The switch is only available for monthly pay.

## Time card with dual confirmation

- E and W see the same month card, one row per day, with status, check-in, check-out, break and total.
- Either party can create or edit a day. The other party sees an unconfirmed marker and a "confirmar" button. The creator cannot confirm their own entry.
- Editing a confirmed entry clears the confirmation.
- Dates before the start date or after the end date are rejected. Future dates accept only day off, holiday and excused.
- W can delete their own unconfirmed entry; E can delete any entry.

## Clock in and out

- W (and E on the contract page) taps "bater entrada" to record the server time in the household timezone, then "bater saída".
- A second check-in the same day, or a check-out without check-in, shows a clear message and changes nothing.
- The button is disabled offline.

## Adjustments

- E adds bonus, transport, advance or deduction with amount, month and note. W and E both see them. E can delete.
- Advances and deductions reduce the amount to receive; bonus and transport increase it.
- In the Extras tab, E opens "Novo lançamento" (toolbar button) to add one in a sheet; there is no inline form. The sheet links to registering a "pagamento extra" for extras already paid.
- The Extras tab also lists the month's extra payments (read-only there, with a link to Pagamentos); they count in "saldo dos lançamentos".

## Payments, receipts and acknowledgement

- E registers a payment with reference month, date, amount (prefilled with the balance), method and an optional receipt (JPEG, PNG, WebP or PDF, up to 5 MB).
- A file with a wrong real type or over the size limit is rejected with a message, whatever its name or declared type.
- E can replace the receipt or delete the payment. Both parties can open the receipt.
- In payment tables the receipt is one icon (a printed receipt) at the end of the row: with a receipt it opens the viewer, where E can also "trocar comprovante"; without one, E's click opens the file picker. There is no "Comprovante" column and no "trocar comprovante" menu item.
- W taps "recebi" once; the stub then shows "recebido" and the time.
- E can "marcar como concluído" (row menu or "Concluir" on the stub) without waiting for W. The payment then shows "concluído", records who confirmed it (`acknowledgedBy`, `acknowledgedByRole: "employer"`) and is audited as `payment.confirm`. A later "recebi" keeps the first confirmation.
- E edits a payment from the row menu ("Editar") in a sheet with the same fields as the form, except the receipt. Changing the reference month, date, amount, method or agreement sends the payment back to "aguardando" (the confirmation was about the old values); note and the extra flag do not. Compensation edits respect what the agreement still owes. Audited as `payment.update`.
- E can mark a payment as "pagamento extra" (not for compensation). It counts as an extra in what is due and as paid, so the month's balance does not change. It shows an "extra" chip in Pagamentos and also appears in the Extras tab as "Pagamento extra · já pago".
- The Observação column is narrow and cut with an ellipsis; hovering shows the full note in a tooltip.

## Monthly summary and CSV statement

- Both see hours, amount earned, adjustments, payments and balance for any month, computed by the shared pay math.
- The CSV opens correctly in Excel pt-BR (BOM, `;` separator), has one row per day plus totals, and neutralizes formula-looking cells.

## Activity log

- Both see who did what and when (entries, confirmations, adjustments, payments, contract changes), newest first.

## Dashboard

Layout and columns: [DESIGN](../DESIGN.md#screens).

- E: four KPI cards for the month (horas no mês, a pagar, pago no mês, pendências) with a context caption each. Pendências adds days without record, entries waiting for confirmation and payments without "recebi".
- E: below the KPIs, the team table (profissional, frequência, hoje, horas, dias, a pagar, status). Each row has quick actions: bater ponto, registrar pagamento, ver cartão and a menu (copiar convite, editar, remover). The row opens the person's page.
- E: column "hoje" shows who is expected today with their status; "pendências" lists actionable items, each linking to the right screen.
- E: with no team, an empty state invites to add a professional.
- W: clock button, today's entry, month hours and amount, last payment with "recebi".

## Team module (/equipe)

- E sees status tabs with counts (ativos, convites pendentes, encerrados, removidos), a search box (name and text columns, accent-insensitive), filters (função, forma de pagamento) and sortable columns.
- Search, filters, tab and sort are in the URL query; reloading or sharing the link keeps them.
- Removed people show "restaurar". "Convites pendentes" are contracts with no linked worker.
- W has no /equipe; the route redirects to Início.

## Profissional page (/equipe/:id)

- Header: avatar, name, função and frequência, status chip, WhatsApp, ligar and copiar Pix (when known), registrar pagamento, editar, remover. `/vinculos/:id` redirects here.
- Tabs: Visão geral, Cartão, Pagamentos, Extras, Histórico, Ajustes.
- Visão geral: month KPIs, estimated vs. actual cost, the agreement (frequência, horários, valor, desconto de faltas), contact, latest entries and payments.
- W sees the same page without employer-only actions and without Ajustes.

## Quadro do mês (/cartao)

- E sees one row per person and one column per day of the month. Worked, falta, justificada/folga/feriado, expected-but-unrecorded and today are visually distinct and each cell has a text label for assistive tech.
- Row totals show horas, dias and a pagar; clicking a row opens that person's Cartão.
- Below `md` the board becomes a list of people with a week strip.
- W's Cartão is their own time card.

## Payments across the team (/pagamentos)

- E sees all payments of all contracts in one table (pessoa, referência, pago em, valor, forma, recebido) with filters (pessoa, ano/mês, forma, recebido) and totals. Row actions: the receipt icon inline; ver pagamentos da pessoa, editar, marcar como concluído and remover in the menu.
- W sees their own payments. Receipts open from either view.

## Logical removal and restore

- E removes a professional from the row menu or the person's page after a confirmation dialog. Nothing is deleted: the contract gets `archivedAt` and any pending invite is dropped. An undo toast shows for a few seconds.
- Archived contracts are read-only for both parties: writes to entries, clock, adjustments and payments fail with "Este vínculo foi removido". History stays readable; W sees the contract marked as removed.
- Archived contracts are missing from the dashboard and from lists unless asked (Equipe tab "removidos").
- E can restore from the removidos tab or the person's page; the contract becomes editable again.

## Invites by e-mail and WhatsApp

- On creation E may type the worker's e-mail and phone (both optional). If either is given, an invite is created at once.
- With an e-mail, the link is sent by mail; the success view says "e-mail enviado para …". If sending fails, the invite still exists and the view shows the code.
- With a phone, the success view has a WhatsApp button opening a `wa.me` link with the message already written. The app does not send WhatsApp messages itself.
- The success view always shows the code, the link and "copiar link". Regenerating the invite invalidates the old code and re-sends the e-mail when one is known.

## Cost estimate in the form

- While E fills the "adicionar profissional" form, a resumo panel shows the schedule in words and the estimated cost for the month (daily: days × rate; hourly: days × hours × rate; monthly: the salary) plus the 12-month average.
- When it cannot be priced (on demand, or hourly without times) the panel says what to fill in.

## Agreements and compensation

An agreement records something the worker pays back in work (a dining table, an advance). Each installment is a payment with method "compensação" linked to the agreement. Endpoints: [api-contract](api-contract.md#agreements-compensation-account-deletion-projections-v3).

- E creates an agreement on the profissional's "Acordos" tab with a description, total, installment (optional) and start month. It shows "aguardando a profissional concordar" until W accepts.
- W sees the agreement and taps "concordar" once. W cannot create or cancel agreements.
- The tab lists descrição, total, abatido, falta, parcela and status (aguardando, em andamento, quitado, cancelado).
- When E registers a payment, "abater de um acordo" offers the open agreements with the installment prefilled. The amount cannot exceed what remains; the form shows the error on the amount.
- A compensation payment counts toward the month's paid total like any payment and W acknowledges it with "recebi". Without an agreement it is allowed only with a note.
- E can cancel an agreement; payments already linked stay. Archived contracts reject agreement changes.

## Delete account

- Perfil has a "Excluir conta" zone for both roles. The dialog explains what is kept for the other party and asks for the password and the word EXCLUIR. A wrong password shows an error on the password field and nothing changes.
- On success all sessions end and the person lands on the login screen. The same e-mail can register again later.
- E deleting: their contracts are archived and stay readable by the workers. W deleting: the worker is unlinked, the employer keeps the history under the worker's name.
- Retention details: [SECURITY](../SECURITY.md#account-deletion-and-lgpd).

## Future months and projections

- Início, Equipe, Cartão (board) and the worker home can navigate forward. Future months show "previsto" values from the estimate, styled as projections (dashed outline, "previsto" label), never mixed with actuals.
- Future months have no hours, no pending counts and no payments to register for them from the dashboard.

## Navigation and invite links

- "voltar" returns to the screen the person came from inside the app, and to the module list only when the page was opened directly. Saving a form returns to where it was opened.
- Opening an invite link (`/criar-conta?convite=`) while signed in shows "Você está conectado como …" with "sair e continuar" instead of redirecting into the app.

## Form controls

- Single choice: custom Select on fine pointers, native picker on touch; the native `<select>` stays in the DOM. `ChoiceField` is a segmented control on `md`+ and a Select below.
- Time and date use masked custom fields (`TimeField`, `DateField`) with a popover on desktop and a sheet on touch; never the browser's own picker.
- On small screens table filters move into a bottom drawer ("Filtros (n)") with "limpar" and "ver resultados".
- Row actions: one action is a single inline button; with more, at most two inline and the rest in the `⋯` menu, remover in coral.

## Layout rules

- Every collection is a table on `md` and wider and a list of cards below, from one column definition.
- Tables have a toolbar (search, filters, count, primary action), sortable headers, empty and "nenhum resultado" states, and URL-synced state.
- The sidebar (`lg` and wider) has the user card with a "sair" button; below `lg`, "sair" is in Perfil and the top-bar account menu.
- Employer navigation: Início, Equipe, Cartão, Pagamentos, Perfil. Worker: Início, Cartão, Pagamentos, Perfil.

## PWA and dark mode

- The app can be installed from the browser and from the profile button, and the shell loads offline.
- Previously loaded data shows with an offline notice. A new version shows an "atualizar" prompt.
- Theme follows the system and can be overridden; the choice persists.

## Cross-cutting

- Invisible resources behave as not found for both roles.
- All copy is pt-BR; money as `R$ 1.234,56`, durations as `86h40`.
- Every control works by keyboard and meets AA contrast in both themes.
