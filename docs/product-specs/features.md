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

The contract carries an agreed schedule (`weekly`, `month_days`, `per_month` or `on_demand`) and, for salaried pay (mensal or quinzenal), a "descontar faltas" switch. Rules and field shapes: [api-contract](api-contract.md#contracts-vínculos). Counting and wording come from `schedule.ts` in `@emdia/shared`; api and web never reimplement them.

Acceptance criteria:

- E picks one kind when creating or editing a contract and sees a short pt-BR description of the result (for example "seg, qua e sex", "quinzenal: sex", "todo dia 5", "2x por mês", "quando precisar"). W sees the same text.
- weekly: E picks weekdays and every how many weeks (1 or 2 and up to 4). Expected days are those weekdays in the month, in weeks that match, counting from the Monday-starting week that holds the first scheduled weekday on or after the start date (a quinzenal Friday that starts on a Saturday has its first visit the next Friday). "Todos os dias" is all seven weekdays.
- month_days: E picks days 1 to 31. In a short month a day past its end falls on the last day. Days outside the contract period are not expected.
- per_month: E gives a number of visits per month. No dates are expected; the month shows "N de M vezes" and nothing is flagged as unrecorded.
- on_demand: nothing is expected, nothing is flagged, days are recorded as they happen.
- Expected days with no entry appear as "registrar" placeholders on the card and count in the unrecorded warning on the dashboard. Days that are not expected can still be recorded.
- Editing the schedule replaces it as a whole, clears fields that do not belong to the new kind, and does not touch entries already recorded.
- Bulk fill (most useful for mensalista): when expected days in the past have no entry, E sees a notice with the count and a "marcar como trabalhados" button. It opens the sheet "marcar dias previstos", with entrada and saída prefilled from the contract's expected times, an editable pausa, and the per-day total times the number of days. Confirming creates one `worked` entry per day, one request each, so the activity log shows each day. Existing entries are never overwritten, so absences and days off must be marked before. Progress is shown and can be stopped; if some days fail, the count saved and the count failed are reported. W sees the new entries as unconfirmed and can confirm them.
- Pay types: por hora, por diária, por plantão, quinzenal (a fixed amount per quinzena, two per month) and mensal. Quinzenal counts in the month as 2 × the quinzena, like a salary.
- Por plantão: the rate is per 24h. A stay is one entry from the check-in day to the check-out day ("saiu em outro dia" in the day editor, up to 7 days, never in the future): Friday 08:00 to Monday 08:00 is 72h, three plantões. The days in between show "em plantão desde sex 02" on the card and the board, can't hold their own entry, and don't count as unrecorded. A worker who clocks in on Friday clocks out on Monday and the open entry closes with Monday's date. The estimate counts one plantão per expected day.
- Adicional noturno: a per-contract switch, on for new contracts and off for those created before it. Minutes worked between 22:00 and 05:00 earn 20% more (LC 150 art. 14, no reduced night hour), priced from the contract's own hour: the hourly rate, the diária over the agreed minutes (8h without times), the plantão over 24h, or the salary over 220h. It shows as its own line in the month and in the CSV, and the day editor's amount includes it.
- Mensalista or quinzenalista with "descontar faltas": each unjustified absence (`absent`) subtracts the month's salary ÷ 30 (rounded to cents) in the summary and statement, shown as its own line. Excused, day off and holiday never deduct. With the switch off, absences do not change the amount.
- The switch is only available for salaried pay (mensal, quinzenal).

## Time card with dual confirmation

- E and W see the same month card, one row per day, with status, check-in, check-out, break and total.
- Either party can create or edit a day. The other party sees an unconfirmed marker and a "confirmar" button. The creator cannot confirm their own entry.
- Editing a confirmed entry clears the confirmation.
- Dates before the start date or after the end date are rejected. Future dates accept only day off, holiday and excused.
- W can delete their own unconfirmed entry; E can delete any entry.
- Pay the day: when E marks today as worked, the day editor offers "pagar este dia agora"; past days don't offer it (pay them in "novo pagamento"). It is off by default; turned on, it shows the same pago em, valor, como pagou and comprovante fields as "novo pagamento". Pago em is locked on today. Valor follows what the day is worth until E types one: the diária, in proportion when the day's hours differ from the agreed times (12h on an 8h diária of R$ 150 is R$ 225, and the hint says so), hours × rate for hourly pay, and empty for a salary. The day's minutes and the agreed times are compared with the same break, so keeping the agreed times is exactly one diária. The month's due amount counts the same value per day, so what the day editor fills in is what the day adds to "a pagar". The payment's reference month is the worked day's month, not the month it is paid in. The payment is validated before the day is saved, so an invalid amount saves nothing. If the day is already recorded and E changed nothing, only the payment is sent, so W's confirmation stays. If the day saves and the payment fails, E is told and the sheet stays open to retry. With an open adiantamento, E can abate the day instead (see [Payment types](#payment-types)). W never sees the payment section in the day editor.

## Clock in and out

- W (and E on the contract page) taps "bater entrada" to record the server time in the household timezone, then "bater saída".
- A second check-in the same day, or a check-out without check-in, shows a clear message and changes nothing.
- The button is disabled offline.

## Payment types

Everything that changes what a month owes lives in Pagamentos; there is no Extras tab (`/equipe/:id/extras` redirects to Pagamentos). Each entry has a type (`Payment.kind`):

- Diárias/salário (`pay`, the default): pays the month. Counts as paid.
- Gratificação (`bonus`) and vale-transporte (`transport`): money handed on top of the pay. They count both in what is due and as paid, so the month's balance does not move. They show in the payments list with their type, take a receipt and a "recebi".
- Desconto (`deduction`): not money handed. It only lowers what is due; it never counts as paid, has no method, no receipt, no "recebi" and no "concluir". Lists show it as a coral negative amount ("− R$ 50,00") with "não se aplica" in the Recebido column; the form hides "como pagou" and the receipt and labels the date "Data".
- Adiantamento (`advance`): money handed ahead, paid down with work. Registering it changes nothing in the month (neither due nor paid) and no day status. It takes a receipt and a "recebi".

Acceptance criteria:

- "Novo pagamento" and the edit sheet have a "Tipo" field with a one-line explanation of the chosen type. The amount is prefilled with the month's balance only for diárias/salário. `?tipo=` opens the form on a type; the old `?extra=1` link opens it on gratificação.
- Compensation is offered only for diárias/salário.
- Payment tables have a Tipo column and a type filter, for both roles. Totals ("total pago") count only what counts as paid; "com recebi" and "aguardando recebi" count only entries where money changed hands.
- Abate a day (E): when E marks a past or current day as worked and the person has an open adiantamento, the day editor offers "abater do adiantamento" (next to "pagar este dia agora" on today; turning one on turns the other off). It shows what remains ("restam R$ 180,00 de R$ 360,00"), picks the oldest open adiantamento (a select appears when there are several) and prefills the day's value (the diária, hours × rate, or salário ÷ 30) capped at what remains; when the day is worth more, the hint says the rest stays to be paid. An amount over what remains is blocked with a message and the day is not saved. Abating creates a compensation payment for the worked day's month, dated the worked day and linked to the adiantamento, so the day counts as paid and the adiantamento's balance drops. Days of any later month can be abated.
- Pagamentos (the person's tab and /pagamentos) shows "Adiantamentos em aberto" with what remains and a progress bar, for E and W. Each abatement names its adiantamento ("Adiantamento de 15/09/2026").
- An adiantamento with abated days cannot be removed (409 with the abated amount), retyped, or lowered below what was abated. Removing an abatement gives its amount back to the adiantamento.
- Data from before this change was migrated so every month keeps its amount due and amount paid; see the decision log in [0002](../exec-plans/active/0002-next.md).

## Payments, receipts and acknowledgement

- E registers a payment with reference month, date, amount (prefilled with the balance), method and an optional receipt (JPEG, PNG, WebP or PDF, up to 5 MB). The reference month is visible and editable; it defaults to the current month (or the month the form was opened from). A payment made from the day editor refers to that day's month.
- A file with a wrong real type or over the size limit is rejected with a message, whatever its name or declared type.
- E can replace the receipt or delete the payment. Both parties can open the receipt.
- In payment tables the receipt is one icon (a printed receipt) at the end of the row: with a receipt it opens the viewer, where E can also "trocar comprovante"; without one, E's click opens the file picker. There is no "Comprovante" column and no "trocar comprovante" menu item.
- The receipt field says it takes drag and drop ("Arraste e solte o arquivo aqui ou clique para escolher", with the accepted types and size) and shows a drag-over state; on touch it says what a tap does. Dropping a file on a chosen receipt replaces it.
- The receipt viewer zooms images (buttons, ctrl/cmd + wheel or trackpad pinch, two-finger pinch, double click, + / - / 0 keys), pans while zoomed (drag or arrow keys) and fits back. PDFs use the browser reader's zoom.
- W taps "recebi" once; the stub then shows "recebido" and the time.
- E can "marcar como concluído" (row menu or "Concluir" on the stub) without waiting for W. The payment then shows "concluído", records who confirmed it (`acknowledgedBy`, `acknowledgedByRole: "employer"`) and is audited as `payment.confirm`. A later "recebi" keeps the first confirmation.
- E edits a payment from the row menu ("Editar") in a sheet with the same fields as the form, except the receipt. Changing the type, reference month, date, amount, method, agreement or adiantamento sends the payment back to "aguardando" (the confirmation was about the old values); the note does not. Compensation edits respect what the agreement or adiantamento still owes. Audited as `payment.update`.
- The Observação column is narrow and cut with an ellipsis; hovering shows the full note in a tooltip.

## Monthly summary and statement

- Both see hours, amount earned, gratificações, vale-transporte and descontos, payments and balance for any month, computed by the shared pay math. The CSV lists every payments-list entry with its type and ends with what is still to be abated from adiantamentos.
- The CSV opens correctly in Excel pt-BR (BOM, `;` separator), has one row per day plus totals, and neutralizes formula-looking cells.
- Both download the month from "Baixar" under the month ledger on the Cartão tab, as PDF or "Planilha (CSV)". The trigger shows a spinner while the file downloads; a failure shows a toast.
- The PDF (A4) has a header (em dia, "Extrato de {mês} de {ano}", worker, employer, casa, combinado with schedule, times and rate, generation date), the month ledger with the same lines as the app (total devido in bold, saldo highlighted), a table of the days that have an entry or were expected (data, dia, situação, entrada, saída with the check-out date when the stay ends on a later day, pausa, horas, confirmado, observação; header repeated on each page), the month's payments (data, tipo, como pagou, valor, situação, observação) and "Gerado pelo em dia · página X de Y" on every page. Empty tables say so in one line.

## Activity log

- Both see who did what and when (entries, confirmations, payments of every type, abatements, contract changes; adjustments from before the payment types keep their old wording), newest first.

## Dashboard

Layout and columns: [DESIGN](../DESIGN.md#screens).

- E: four KPI cards for the month (a pagar, pago no mês, custo do mês, pendências) with a context caption each. Custo do mês is the forecast from `DashboardItem.estimate` (what the month costs if everyone comes on the agreed days), styled as a projection with the "previsto" tag and captioned with people and agreed days, or with who can't be priced. Hours worked are not a KPI for the employer; they stay in the team table and on the worker's home. Pendências adds days without record, entries waiting for confirmation and payments without "recebi".
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

- Header: avatar, name, função and frequência, status chip, WhatsApp, ligar and copiar Pix (when known), registrar pagamento, editar and a `⋯` menu with encerrar vínculo and remover. `/vinculos/:id` redirects here.
- Tabs: Visão geral, Cartão, Pagamentos, Acordos, Histórico.
- Editar opens a sheet with the combinado (the contract form) and, once the worker has joined, "Contato de {nome}" with the e-mail and phone from the worker's own account; the typed contact fields only show before that. `/equipe/:id/ajustes` and `?editar=1` open the sheet.
- Visão geral: the invite (generate or resend the code) while nobody has joined, month KPIs, estimated vs. actual cost, the agreement (frequência, horários, valor, desconto de faltas, adicional noturno), contact, latest entries and payments.
- W sees the same page without employer-only actions.

## Quadro do mês (/cartao)

- E sees one row per person and one column per day of the month. Worked, falta, justificada/folga/feriado, expected-but-unrecorded and today are visually distinct and each cell has a text label for assistive tech.
- Row totals show horas, dias and a pagar; clicking a row (outside the day cells) opens that person's Cartão.
- Clicking a day cell, or Enter or Space on a focused cell, opens that day's editor in place, without leaving the board, so E can record the day and pay it there. Days outside the contract period do not open. Closing the editor returns focus to the cell; saving refreshes the board totals.
- Below `md` the board becomes a list of people with a week strip. The person's name opens their Cartão; each day of the strip is a button that opens the day editor in place.
- W's Cartão is their own time card.

## Payments across the team (/pagamentos)

- E sees all payments of all contracts in one table (pessoa, referência, pago em, valor, forma, recebido) with filters (pessoa, ano/mês, forma, recebido) and totals. Row actions: the receipt icon inline; ver pagamentos da pessoa, editar, marcar como concluído and remover in the menu.
- W sees their own payments. Receipts open from either view.

## Logical removal and restore

- E removes a professional from the row menu or the person's page after a confirmation dialog. Nothing is deleted: the contract gets `archivedAt` and any pending invite is dropped. An undo toast shows for a few seconds.
- Archived contracts are read-only for both parties: writes to entries, clock and payments fail with "Este vínculo foi removido". History stays readable; W sees the contract marked as removed.
- Archived contracts are missing from the dashboard and from lists unless asked (Equipe tab "removidos").
- E can restore from the removidos tab or the person's page; the contract becomes editable again.

## Invites by e-mail and WhatsApp

- On creation E may type the worker's e-mail and phone (both optional). If either is given, an invite is created at once.
- With an e-mail, the link is sent by mail; the success view says "e-mail enviado para …". If sending fails, the invite still exists and the view shows the code.
- With a phone, the success view has a WhatsApp button opening a `wa.me` link with the message already written. The app does not send WhatsApp messages itself.
- The success view always shows the code, the link and "copiar link". Regenerating the invite invalidates the old code and re-sends the e-mail when one is known.

## Cost estimate in the form

- While E fills the "adicionar profissional" form, a resumo panel shows the schedule in words and the estimated cost for the month (daily: days × rate; hourly: days × hours × rate; monthly: the salary; quinzenal: 2 × the quinzena) plus the 12-month average, and "equivale a": the rate restated por mês, por quinzena, por dia and por hora (`derivedRates`). A day becomes a month with the average expected days over 12 months, and an hour comes from the agreed times; a unit that needs what isn't known (no times, quando precisar) is left out. Nothing of this is stored.
- When it cannot be priced (on demand, or hourly without times) the panel says what to fill in.

## Agreements and compensation

An agreement records something the worker pays back in work (a dining table, an advance). Each installment is a payment with method "compensação" linked to the agreement. Endpoints: [api-contract](api-contract.md#agreements-compensation-account-deletion-projections-v3).

- E creates an agreement on the profissional's "Acordos" tab with a description, total, installment (optional) and start month. It shows "aguardando a profissional concordar" until W accepts.
- W sees the agreement and taps "concordar" once. W cannot create, remove or restore agreements.
- The tab lists descrição, total, abatido, falta, parcela and status (aguardando, em andamento, quitado, cancelado). Removed agreements are hidden unless the "Situação" filter is set to "Removidos".
- With no agreements the tab shows a handshake icon and one short line for each role.
- When E registers a payment, "abater de um acordo" offers the open agreements with the installment prefilled. The amount cannot exceed what remains; the form shows the error on the amount.
- A compensation payment counts toward the month's paid total like any payment and W acknowledges it with "recebi". Without an agreement it is allowed only with a note.
- E can remove an agreement from its row menu ("Remover acordo", with a confirmation and a "desfazer" toast). Removal is logical: the agreement leaves the list, and its compensation payments leave the payment lists and the month's paid total for both roles. Restoring it ("Restaurar" in the "Removidos" filter) brings the agreement and its payments back unchanged. A removed agreement cannot be accepted or paid down.
- The UI no longer offers "cancelar"; agreements cancelled before stay as "cancelado" and keep their payments. Archived contracts reject agreement changes.

## Delete account

- Perfil has a "Excluir conta" zone for both roles. The dialog explains what is kept for the other party and asks for the password and the word EXCLUIR. A wrong password shows an error on the password field and nothing changes.
- On success all sessions end and the person lands on the login screen. The same e-mail can register again later.
- E deleting: their contracts are archived and stay readable by the workers. W deleting: the worker is unlinked, the employer keeps the history under the worker's name.
- Retention details: [SECURITY](../SECURITY.md#account-deletion-and-lgpd).

## Future months and projections

- Início, Equipe, Cartão (board) and the worker home can navigate forward. Future months show "previsto" values from the estimate, styled as projections (dashed outline, "previsto" label), never mixed with actuals.
- Future months have no hours, no pending counts and no payments to register for them from the dashboard.

## Feedback

- Both roles can send feedback from "Enviar feedback" (sidebar on desktop, account menu on mobile). A sheet asks what it is about (sugestão, problema, outro) and the message (5 to 2000 characters); the current screen goes along so a problem can be reproduced.
- The message is mailed to the team with the user's e-mail as reply-to; nothing is stored in the database. Sending clears the form and thanks the user; a failure keeps the draft and says to try again.

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
