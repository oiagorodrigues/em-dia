# Features

Acceptance criteria per role. Endpoints are in [api-contract](api-contract.md); screens in [DESIGN](../DESIGN.md#layout). E = employer, W = worker.

## Auth and accounts

- E and W can register with name, email and password; E gets a household "Minha casa". W may enter an invite code at registration.
- Login with wrong credentials shows one generic message. After 5 consecutive failures the account locks for 15 minutes and the UI says so.
- Session survives a page reload (silent refresh). "Sair de todos os dispositivos" ends every session.
- Forgot password always shows the same confirmation. A reset link works once, within 30 minutes, and ends all sessions.
- Profile: both edit name and phone; W edits the Pix key; both change password and theme.

## Contracts and invites

- E creates a contract with name, occupation, pay type, rate, scheduled weekdays, expected times and start date, and gets an 8-character invite code plus a shareable link.
- E can edit a contract, regenerate the code (the old one stops working) and end the contract with an end date.
- W joins with the code. An invalid or expired code gives "not found". W sees only contracts they are linked to.
- E sees the worker's Pix key on the contract page with a copy button.

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

## Payments, receipts and acknowledgement

- E registers a payment with reference month, date, amount (prefilled with the balance), method and an optional receipt (JPEG, PNG, WebP or PDF, up to 5 MB).
- A file with a wrong real type or over the size limit is rejected with a message, whatever its name or declared type.
- E can replace the receipt or delete the payment. Both parties can open the receipt.
- W taps "recebi" once; the stub then shows "recebido" and the time.

## Monthly summary and CSV statement

- Both see hours, amount earned, adjustments, payments and balance for any month, computed by the shared pay math.
- The CSV opens correctly in Excel pt-BR (BOM, `;` separator), has one row per day plus totals, and neutralizes formula-looking cells.

## Activity log

- Both see who did what and when (entries, confirmations, adjustments, payments, contract changes), newest first.

## Dashboard

- E: total hours and total to pay this month across contracts, one card per contract with today's status and a warning for unrecorded scheduled days; empty state invites to add a professional.
- W: clock button, today's entry, month hours and amount, last payment with "recebi".

## PWA and dark mode

- The app can be installed from the browser and from the profile button, and the shell loads offline.
- Previously loaded data shows with an offline notice. A new version shows an "atualizar" prompt.
- Theme follows the system and can be overridden; the choice persists.

## Cross-cutting

- Invisible resources behave as not found for both roles.
- All copy is pt-BR; money as `R$ 1.234,56`, durations as `86h40`.
- Every control works by keyboard and meets AA contrast in both themes.
