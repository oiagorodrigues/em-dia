/**
 * End-to-end user journeys against the running app (`bun run dev`), driven with the system Chrome.
 * Every run signs up fresh users, so it never depends on seed data. Exits non-zero when any journey
 * fails or the browser saw console errors, page errors or 5xx responses.
 *
 *   bun run flows
 *
 * Journeys share state (employer, worker, contract) and run in the order listed at the bottom.
 * The password reset journey runs last because it revokes every session of the employer.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "playwright-core";
import {
  datesOfMonth,
  expectedDatesInMonth,
  type YearMonth,
} from "../../../packages/shared/src/index.ts";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const API = process.env.API_URL ?? "http://localhost:3000/api/v1";
const OUT = new URL("../out/", import.meta.url).pathname;
const TIMEZONE = "America/Sao_Paulo";
const VIEWPORT = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const TIMEOUT = 8_000;

const RUN = Date.now();
const PASSWORD = "emdia12345";
const NEW_PASSWORD = "outrasenha987";
const EMPLOYER_NAME = "Dona E2E";
const WORKER_NAME = "Rosa E2E";

interface Session {
  label: string;
  context: BrowserContext;
  page: Page;
}

interface State {
  browser: Browser;
  employerEmail: string;
  workerEmail: string;
  employer?: Session;
  worker?: Session;
  desk?: Session;
  inviteCode?: string;
  contractId?: string;
  receiptPng?: string;
}

const problems: string[] = [];
const sessions: Session[] = [];

// Known, intended failures: anonymous session restore (401), wrong password (401), rejected upload (415).
const EXPECTED_CONSOLE = /status of (401|415)/;

async function openSession(
  state: State,
  label: string,
  viewport: { width: number; height: number } = VIEWPORT,
): Promise<Session> {
  const context = await state.browser.newContext({ viewport, locale: "pt-BR" });
  context.setDefaultTimeout(TIMEOUT);
  const page = await context.newPage();
  page.on("console", (msg) => {
    if (EXPECTED_CONSOLE.test(msg.text())) return;
    if (msg.type() === "error" || msg.type() === "warning")
      problems.push(`[${label}] console.${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => problems.push(`[${label}] pageerror: ${err.message}`));
  page.on("response", (res) => {
    if (res.status() >= 500)
      problems.push(`[${label}] ${res.status()} ${res.request().method()} ${res.url()}`);
  });
  const session = { label, context, page };
  sessions.push(session);
  return session;
}

// Helpers

/** Wraps Playwright's timeout errors so a failure says what the journey expected. */
async function see(what: string, target: Locator): Promise<void> {
  try {
    await target.first().waitFor({ state: "visible" });
  } catch {
    throw new Error(`expected to see ${what}`);
  }
}

async function absent(what: string, target: Locator): Promise<void> {
  try {
    await target.first().waitFor({ state: "hidden" });
  } catch {
    throw new Error(`expected ${what} to be gone`);
  }
}

async function poll<T>(
  what: string,
  read: () => Promise<T | false>,
  timeout = TIMEOUT,
): Promise<T> {
  const deadline = Date.now() + timeout;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await read();
      if (value !== false) return value;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(
    `timed out waiting for ${what}${last ? ` (${(last as Error).message.split("\n")[0]})` : ""}`,
  );
}

async function textOf(target: Locator): Promise<string> {
  return (await target.first().innerText()).replace(/\s+/g, " ").trim();
}

/** A button or a link, since the design system renders `<Button to>` as an anchor. */
function action(root: Page | Locator, name: string | RegExp): Locator {
  return root.getByRole("button", { name }).or(root.getByRole("link", { name }));
}

/** Segmented controls hide their radios; the visible label is the click target. */
/** Segmented control on wide screens, a Select (combobox plus a listbox) on phones; both driven like a user would. */
async function choose(root: Page | Locator, group: string, option: string): Promise<void> {
  const radios = root.getByRole("radiogroup", { name: group });
  const combo = root.getByRole("combobox", { name: group }).last();
  await radios.or(combo).first().waitFor();
  if (await radios.count()) {
    await radios.getByText(option, { exact: true }).click();
    return;
  }
  const page = "page" in root && typeof root.page === "function" ? root.page() : (root as Page);
  await combo.click();
  try {
    await page.getByRole("option", { name: option, exact: true }).click({ timeout: 3_000 });
  } catch {
    throw new Error(
      `the "${group}" list opened but "${option}" cannot be clicked (list hidden or covered)`,
    );
  }
}

function parseCents(text: string): number {
  const digits = text.replace(/\D/g, "");
  if (!digits) throw new Error(`no amount in "${text}"`);
  return Number(digits);
}

function today(): { date: string; prevMonth: string; prevMonthStart: string } {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
  const [y, m] = date.split("-").map(Number) as [number, number];
  const prevMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return { date, prevMonth, prevMonthStart: `${prevMonth}-01` };
}

function need<T>(value: T | undefined, journey: number): T {
  if (value === undefined)
    throw new Error(`blocked: journey ${journey} did not produce what this one needs`);
  return value;
}

async function register(
  page: Page,
  role: "Eu contrato" | "Eu trabalho",
  name: string,
  email: string,
  query = "",
) {
  await page.goto(`${BASE}/criar-conta${query}`);
  await page.getByText(role, { exact: true }).click();
  await page.getByLabel("Seu nome").fill(name);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  return page;
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE}/entrar`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await action(page, /^Entrar$/).click();
}

function todayRow(page: Page): Locator {
  return page.locator('button[aria-current="date"]');
}

interface ContractSpec {
  workerName: string;
  occupation?: string;
  contactEmail?: string;
  /** Digits only; the field formats them. */
  contactPhone?: string;
  payType: "Por hora" | "Por diária" | "Mensal";
  /** Digits as typed into the money field: "15000" is R$ 150,00. */
  rate: string;
  /** Default is weekly Monday, Wednesday and Friday. */
  kind?: "Dias da semana" | "Datas do mês" | "Vezes por mês" | "Quando precisar";
  /** 0 = Sunday. Weekly only. */
  weekdays?: number[];
  weekdayPreset?: string;
  everyWeeks?: "Toda semana" | "A cada 2" | "A cada 3";
  visitsPerMonth?: number;
  deductAbsences?: boolean;
  startedOn: string;
}

const RATE_LABEL = {
  "Por hora": "Valor da hora",
  "Por diária": "Valor da diária",
  Mensal: "Salário mensal",
};

/** Fills the new-contract form; the caller clicks the submit button. */
async function fillContractForm(page: Page, spec: ContractSpec): Promise<void> {
  await page.getByLabel("Nome de quem trabalha").fill(spec.workerName);
  if (spec.occupation) await choose(page, "Função", spec.occupation);
  if (spec.contactEmail) await page.getByLabel("E-mail").fill(spec.contactEmail);
  if (spec.contactPhone) await page.getByLabel("Telefone (WhatsApp)").fill(spec.contactPhone);
  await choose(page, "Como paga", spec.payType);
  await page.getByLabel(RATE_LABEL[spec.payType]).fill(spec.rate);
  if (spec.deductAbsences) await page.getByText("Descontar faltas sem justificativa").click();

  await choose(page, "Frequência", spec.kind ?? "Dias da semana");
  if (spec.weekdayPreset)
    await action(page.getByRole("group", { name: "Atalhos" }), spec.weekdayPreset).click();
  if (spec.weekdays) {
    const toggles = page.getByRole("group", { name: "Dias da semana" }).getByRole("button");
    for (let i = 0; i < 7; i++) {
      const day = (i + 1) % 7;
      const on = (await toggles.nth(i).getAttribute("aria-pressed")) === "true";
      if (on !== spec.weekdays.includes(day)) await toggles.nth(i).click();
    }
  }
  if (spec.everyWeeks) await choose(page, "Repete a cada quantas semanas", spec.everyWeeks);
  if (spec.visitsPerMonth !== undefined) {
    const stepper = page.getByRole("group", { name: "Vezes por mês" });
    while ((await textOf(stepper.locator("output"))).trim() !== String(spec.visitsPerMonth)) {
      await stepper.getByRole("button", { name: /^Menos/ }).click();
    }
  }
  await page.getByLabel("Começou em", { exact: true }).fill(spec.startedOn);
}

/** Creates a contract as the signed-in employer; returns its id and the invite code shown afterwards. */
async function addContractWithInvite(
  page: Page,
  spec: ContractSpec,
): Promise<{ id: string; code: string }> {
  await page.goto(`${BASE}/equipe/novo`);
  await fillContractForm(page, spec);
  await action(page, /^Salvar profissional$/).click();
  const code = (await page.locator(".inv__code").innerText()).replace(/\s/g, "");
  await action(page, /^Abrir cartão de /).click();
  await page.waitForURL(/\/equipe\/(?!novo)[^/]+$/);
  return { id: page.url().split("/").pop()!, code };
}

async function addContract(page: Page, spec: ContractSpec): Promise<string> {
  return (await addContractWithInvite(page, spec)).id;
}

// Journeys

async function employerSignup(state: State): Promise<void> {
  const { page } = (state.employer = await openSession(state, "employer"));
  await register(page, "Eu contrato", EMPLOYER_NAME, state.employerEmail);
  await action(page, /^Criar conta$/).click();
  await page.waitForURL("**/equipe/novo");

  await page.goto(BASE);
  await see("the empty dashboard", page.getByText("Ninguém cadastrado ainda."));
  await action(page, /adicionar profissional/i).click();
  await page.waitForURL("**/equipe/novo");

  await fillContractForm(page, {
    workerName: WORKER_NAME,
    payType: "Por diária",
    rate: "15000",
    weekdays: [1, 3, 5],
    startedOn: today().prevMonthStart,
  });
  await action(page, /^Salvar profissional$/).click();

  const invite = page.getByRole("region", { name: "Código de convite" });
  await see("the invite code", invite.locator(".inv__code"));
  const code = (await invite.locator(".inv__code").innerText()).replace(/\s/g, "");
  if (!/^[A-Z0-9]{8}$/.test(code)) throw new Error(`invite code "${code}" is not 8 letters/digits`);
  state.inviteCode = code;

  await action(page, /^Abrir cartão de /).click();
  await page.waitForURL(/\/equipe\/(?!novo)[^/]+$/);
  state.contractId = page.url().split("/").pop()!;
  await see("the worker name on the card", page.getByRole("heading", { name: WORKER_NAME }));
}

async function workerClocksIn(state: State): Promise<void> {
  const code = need(state.inviteCode, 1);
  const { page } = (state.worker = await openSession(state, "worker"));
  await register(page, "Eu trabalho", WORKER_NAME, state.workerEmail, `?convite=${code}`);
  await action(page, /^Criar conta$/).click();
  await page.waitForURL(`${BASE}/`);
  await see("the employer's house on the worker home", page.getByText(EMPLOYER_NAME).first());

  await action(page, /bater entrada/i).click();
  const row = page.locator('section[aria-label="Hoje"]');
  const columns = row.locator("dd");
  await poll("a check-in time in today's row", async () =>
    /\d{2}:\d{2}/.test(await textOf(columns.nth(0))),
  );

  await action(page, /bater saída/i).click();
  await poll("a check-out time in today's row", async () =>
    /\d{2}:\d{2}/.test(await textOf(columns.nth(1))),
  );
  await see("the closed day", action(page, /dia fechado/i));
}

async function confirmDay(state: State): Promise<void> {
  const id = need(state.contractId, 1);
  const { page } = need(state.employer, 1);
  const worker = need(state.worker, 2).page;

  await page.goto(`${BASE}/equipe/${id}`);
  await see(
    "today waiting for confirmation",
    todayRow(page).and(page.locator('[aria-label$="aguardando confirmação"]')),
  );
  await see("the pending confirmation banner", page.getByText(/sua confirmação/).first());

  await todayRow(page).click();
  const dialog = page.getByRole("dialog");
  await see(
    "'aguardando sua confirmação' in the day editor",
    dialog.getByText("aguardando sua confirmação"),
  );
  await action(dialog, /^confirmar$/i).click();
  await absent("the day editor", dialog);
  await see(
    "today confirmed",
    page.locator('button[aria-current="date"][aria-label$="confirmado"]'),
  );

  await todayRow(page).click();
  await see("'Confirmado' in the day editor", dialog.getByText(/^Confirmado/));
  await action(dialog, "Fechar").click();

  await worker.goto(`${BASE}/equipe/${id}`);
  await see(
    "today confirmed on the worker side",
    worker.locator('button[aria-current="date"][aria-label$="confirmado"]'),
  );
  await worker.goto(BASE);
  await see("the worker home", worker.locator('section[aria-label="Hoje"]'));
  await absent("the pending-confirmation note", worker.getByText(/aguardando confirmação/));
}

async function markAbsence(state: State): Promise<void> {
  const { page } = need(state.employer, 1);
  await page.goto(`${BASE}/equipe/${need(state.contractId, 1)}?mes=${today().prevMonth}`);

  const missing = page.getByRole("button", { name: /dia previsto sem registro/ });
  await see("a past scheduled day without a record in the previous month", missing);
  await missing.first().click();

  const dialog = page.getByRole("dialog");
  await choose(dialog, "O que aconteceu", "Faltou");
  await action(dialog, /^anotar$/i).click();
  await absent("the day editor", dialog);

  const absentRow = page.getByRole("button", { name: /Faltou/ });
  await see("the absence row", absentRow);
  await see("the FALTA stamp", absentRow.getByText(/^falta$/i));
}

async function addExtra(state: State): Promise<void> {
  const { page } = need(state.employer, 1);
  const id = need(state.contractId, 1);
  const total = page.locator(".ledger__total dd");

  await page.goto(`${BASE}/equipe/${id}`);
  await see("the monthly total", total);
  const before = parseCents(await textOf(total));

  await page.goto(`${BASE}/equipe/${id}/extras`);
  await action(page, "Novo lançamento").click();
  const sheet = page.getByRole("dialog");
  await choose(sheet, "Tipo", "Vale-transporte");
  await sheet.getByLabel("Valor", { exact: true }).fill("2000");
  await action(sheet, /^lançar em/i).click();
  await see("the new entry in the list", page.getByRole("list").getByText("Vale-transporte"));
  await see("the extras net", page.getByText("saldo dos lançamentos"));
  const net = await textOf(page.locator(".ex__net .mono"));
  if (parseCents(net) !== 2000) throw new Error(`extras net is "${net}", expected R$ 20,00`);

  await page.goto(`${BASE}/equipe/${id}`);
  await see("the monthly total", total);
  await see("the extras line in the ledger", page.getByText("Extras e descontos"));
  const after = await poll("the total to grow by R$ 20,00", async () => {
    const value = parseCents(await textOf(total));
    return value - before === 2000 && value;
  });
  void after;
}

async function createPayment(state: State): Promise<void> {
  const { page } = need(state.employer, 1);
  const id = need(state.contractId, 1);

  const png = join(OUT, "receipt.png");
  const probe = await page.context().newPage();
  await probe.setContent(
    '<body style="margin:0;background:#fc6;font:700 40px sans-serif">recibo</body>',
  );
  await probe.screenshot({ path: png, clip: { x: 0, y: 0, width: 200, height: 120 } });
  await probe.close();
  state.receiptPng = png;
  const fake = join(OUT, "fake.png");
  await writeFile(fake, "isto nao e uma imagem, so texto com extensao .png\n");

  await page.goto(`${BASE}/pagamentos/novo?vinculo=${id}`);
  await page.getByLabel("Valor", { exact: true }).fill("5000");
  await choose(page, "Como pagou", "Dinheiro");

  await page.locator('input[type="file"]').setInputFiles(fake);
  await action(page, /^Registrar pagamento$/).click();
  const error = page.locator('p[role="alert"]').filter({ hasText: /\w/ });
  await see("a pt-BR error for the fake .png", error);
  const message = await textOf(error);
  if (!/comprovante|imagem|arquivo|PDF/i.test(message))
    throw new Error(`error is not helpful pt-BR: "${message}"`);
  if (!page.url().includes("/pagamentos/novo"))
    throw new Error("left the form after a rejected receipt");

  await page.getByRole("button", { name: "Remover comprovante" }).click();
  await page.locator('input[type="file"]').setInputFiles(png);
  await see("the receipt preview", page.getByAltText("Prévia do comprovante"));
  await action(page, /^Registrar pagamento$/).click();
  await page.waitForURL(/\/equipe\/[^/]+\/pagamentos/);

  await see("the payment stub", page.getByRole("article", { name: /Pagamento de R\$\s*50,00/ }));
  const stubs = await page.getByRole("article").count();
  if (stubs !== 1)
    throw new Error(
      `expected 1 payment after one rejected and one accepted upload, found ${stubs}`,
    );

  await action(page, /ver comprovante/i).click();
  const image = page.getByRole("dialog").getByRole("img", { name: /Comprovante de/ });
  await see("the receipt image", image);
  const src = await image.getAttribute("src");
  if (!src?.startsWith("blob:")) throw new Error(`receipt src is "${src}", expected a blob: URL`);
  const decoded = await poll(
    "the receipt image to decode",
    async () => (await image.evaluate((el: HTMLImageElement) => el.naturalWidth)) > 0,
  );
  void decoded;
}

async function acknowledgePayment(state: State): Promise<void> {
  const id = need(state.contractId, 1);
  const worker = need(state.worker, 2).page;
  const employer = need(state.employer, 1).page;

  await worker.goto(`${BASE}/equipe/${id}/pagamentos`);
  await action(worker, /^recebi$/i).click();
  await see("the worker's 'recebido' stamp", worker.getByText(/recebido/i));

  await employer.goto(`${BASE}/equipe/${id}/pagamentos`);
  await see(
    "'recebido' on the employer side",
    employer.getByRole("article").getByText(/recebido/i),
  );
}

async function downloadCsv(state: State): Promise<void> {
  const { page } = need(state.employer, 1);
  await page.goto(`${BASE}/equipe/${need(state.contractId, 1)}`);
  const button = action(page, /baixar planilha/i);
  await see("the download button", button);
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);

  const filename = download.suggestedFilename();
  if (!filename.endsWith(".csv")) throw new Error(`download is named "${filename}", expected .csv`);
  const path = need((await download.path()) ?? undefined, 10);
  const content = await readFile(path, "utf8");
  if (!content.includes(WORKER_NAME))
    throw new Error(`CSV does not contain "${WORKER_NAME}":\n${content.slice(0, 300)}`);
  if (!content.includes(";"))
    throw new Error(`CSV has no ';' separator:\n${content.slice(0, 300)}`);
}

async function monthlyAllDays(state: State): Promise<void> {
  const { page } = need(state.employer, 1);
  const { prevMonth, prevMonthStart } = today();
  const id = await addContract(page, {
    workerName: "Mensalista E2E",
    payType: "Mensal",
    rate: "300000",
    deductAbsences: true,
    weekdayPreset: "todos os dias",
    startedOn: prevMonthStart,
  });
  await page.goto(`${BASE}/equipe/${id}?mes=${prevMonth}`);

  const days = datesOfMonth(prevMonth as YearMonth).length;
  const rows = page.locator("button.row");
  const missing = page.getByRole("button", { name: /dia previsto sem registro/ });
  await see("every day of last month as missing", missing);
  if ((await missing.count()) !== days)
    throw new Error(`expected ${days} missing days, found ${await missing.count()}`);

  await action(page, /marcar como trabalhados/i).click();
  const dialog = page.getByRole("dialog");
  await action(dialog, new RegExp(`^marcar ${days} dias$`, "i")).click();
  await absent("the bulk sheet", dialog);
  await poll("no days left without a record", async () => (await missing.count()) === 0);
  const worked = await rows.filter({ hasText: /\d{2}:\d{2}/ }).count();
  if (worked !== days)
    throw new Error(`expected ${days} worked days after the bulk fill, found ${worked}`);

  await rows.first().click();
  await choose(dialog, "O que aconteceu", "Faltou");
  await action(dialog, /^salvar$/i).click();
  await absent("the day editor", dialog);

  const deduction = page.locator(".ledger__line").filter({ hasText: "Faltas descontadas" });
  await see("the 'Faltas descontadas' line", deduction);
  const value = await textOf(deduction.locator("dd"));
  if (parseCents(value) !== 10000) {
    throw new Error(
      `absence deduction is "${value}", expected R$ 100,00 (salary R$ 3.000,00 / 30)`,
    );
  }
}

async function oncePerMonth(state: State): Promise<void> {
  const { page } = need(state.employer, 1);
  const id = await addContract(page, {
    workerName: "Visita E2E",
    payType: "Por diária",
    rate: "20000",
    kind: "Vezes por mês",
    visitsPerMonth: 1,
    startedOn: today().prevMonthStart,
  });
  const placeholders = page.getByText("— registrar");

  await page.goto(`${BASE}/equipe/${id}`);
  await see("'visitas: 0 de 1'", page.getByText("visitas: 0 de 1"));
  if ((await placeholders.count()) !== 0)
    throw new Error("per-month contract shows '— registrar' placeholders");

  await todayRow(page).click();
  await action(page.getByRole("dialog"), /^anotar$/i).click();
  await see("'visitas: 1 de 1'", page.getByText("visitas: 1 de 1"));
  if ((await placeholders.count()) !== 0)
    throw new Error("'— registrar' placeholders after recording the visit");
}

async function biweekly(state: State): Promise<void> {
  const { page } = need(state.employer, 1);
  const { date, prevMonth, prevMonthStart } = today();
  const schedule = {
    kind: "weekly" as const,
    weekdays: [5],
    everyWeeks: 2,
    monthDays: [],
    visitsPerMonth: null,
  };
  const id = await addContract(page, {
    workerName: "Quinzenal E2E",
    payType: "Por diária",
    rate: "10000",
    weekdays: [5],
    everyWeeks: "A cada 2",
    startedOn: prevMonthStart,
  });

  const currentMonth = date.slice(0, 7);
  for (const month of [prevMonth, currentMonth]) {
    const period = { startedOn: prevMonthStart, endedOn: null };
    const expected = expectedDatesInMonth(schedule, month as YearMonth, period).filter(
      (d) => d <= date,
    );
    const fridays = datesOfMonth(month as YearMonth).filter(
      (d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 5,
    );
    if (month === prevMonth && expected.length >= fridays.length)
      throw new Error("test bug: biweekly equals weekly");

    await page.goto(`${BASE}/equipe/${id}?mes=${month}`);
    await see("the time card", page.locator("button.row").first());
    const missing = page.getByRole("button", { name: /dia previsto sem registro/ });
    await poll("the card to settle", async () => (await missing.count()) === expected.length);
    const shown = (await missing.locator(".row__num").allInnerTexts()).map(Number);
    const wanted = expected.map((d) => Number(d.slice(8)));
    if (JSON.stringify(shown) !== JSON.stringify(wanted)) {
      throw new Error(
        `${month}: card expects days ${shown.join(", ")}, shared expectedDatesInMonth says ${wanted.join(", ")}`,
      );
    }
  }
}

/** The employer signed in on a desktop-sized window, shared by the v2 journeys. */
async function deskOf(state: State): Promise<Page> {
  if (!state.desk) {
    state.desk = await openSession(state, "desk", DESKTOP);
    await login(state.desk.page, state.employerEmail, PASSWORD);
    await state.desk.page.waitForURL(`${BASE}/`);
  }
  return state.desk.page;
}

function teamTable(page: Page): Locator {
  return page.getByRole("region", { name: "Equipe" });
}

/** Body rows of a DataTable, leaving out the loading skeleton's placeholder rows. */
function dataRows(region: Locator): Locator {
  return region.locator('table:not([aria-hidden="true"]) tbody tr');
}

function personRow(table: Locator, name: string): Locator {
  return table.getByRole("row").filter({ hasText: name });
}

/** Submits the payment form and waits for the POST to succeed and the form to close, so a later goto cannot abort it. */
async function submitPayment(page: Page): Promise<void> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        /\/contracts\/[^/]+\/payments$/.test(new URL(r.url()).pathname),
    ),
    action(page, /^Registrar pagamento$/).click(),
  ]);
  if (!response.ok()) throw new Error(`creating the payment returned ${response.status()}`);
  await page.waitForURL((url) => !url.pathname.endsWith("/pagamentos/novo"));
}

async function registerPayment(page: Page, contractId: string, digits: string): Promise<void> {
  await page.goto(`${BASE}/pagamentos/novo?vinculo=${contractId}`);
  await page.getByLabel("Valor", { exact: true }).fill(digits);
  await choose(page, "Como pagou", "Dinheiro");
  await submitPayment(page);
  await page.waitForURL(/\/equipe\/[^/]+\/pagamentos/);
}

async function contactInvite(state: State): Promise<void> {
  const page = await deskOf(state);
  const email = `e2e+${RUN}-contact@emdia.dev`;
  await page.goto(`${BASE}/equipe/novo`);
  await fillContractForm(page, {
    workerName: "Contato E2E",
    contactEmail: email,
    contactPhone: "11912345678",
    payType: "Por diária",
    rate: "18000",
    weekdays: [1, 3, 5],
    startedOn: today().prevMonthStart,
  });

  const summary = page.getByRole("complementary", { name: "resumo" });
  await see("the estimate panel", summary.getByText("custo estimado"));
  await poll("a diárias breakdown in the estimate", async () => {
    const text = await textOf(summary);
    return /\d+ diárias? × R\$\s*180,00/.test(text) && text;
  });

  await action(page, /^Salvar profissional$/).click();
  await see(
    "the e-mail sent notice",
    page.getByText(/E-mail enviado para/).filter({ hasText: email }),
  );
  const wa = page.getByRole("link", { name: /Mandar no WhatsApp/ });
  await see("the WhatsApp link", wa);
  const href = await wa.getAttribute("href");
  if (!href?.startsWith("https://wa.me/55")) throw new Error(`WhatsApp link is "${href}"`);

  const code = (await page.locator(".inv__code").innerText()).replace(/\s/g, "");
  const mail = await poll("the invite e-mail in the dev outbox", async () => {
    const { messages } = (await (await fetch(`${API}/dev/outbox`)).json()) as {
      messages: { to: string; text: string }[];
    };
    return messages.find((m) => m.to === email) ?? false;
  });
  if (!mail.text.includes(`/criar-conta?convite=${code}`)) {
    throw new Error(
      `invite e-mail does not link to the signup with code ${code}:\n${mail.text.slice(0, 300)}`,
    );
  }
}

async function removeAndRestore(state: State): Promise<void> {
  const page = await deskOf(state);
  const name = "Remover E2E";
  const id = await addContract(page, {
    workerName: name,
    payType: "Por diária",
    rate: "10000",
    weekdays: [2],
    startedOn: today().prevMonthStart,
  });

  await page.goto(BASE);
  const home = teamTable(page);
  await see(`${name} on Início`, personRow(home, name));
  await page.getByRole("button", { name: `Mais ações para ${name}` }).click();
  await page.getByRole("menuitem", { name: "remover" }).click();
  const dialog = page.getByRole("dialog");
  await see("the removal confirmation", dialog.getByText(`remover ${name}?`));
  await action(dialog, /^Remover$/).click();
  await poll(`${name} to leave Início`, async () => (await personRow(home, name).count()) === 0);

  await page.goto(`${BASE}/equipe`);
  const team = teamTable(page);
  const tabs = page.getByRole("group", { name: "Situação" });
  await see("the team table", team);
  await poll(
    `${name} to be absent from 'ativos'`,
    async () => (await personRow(team, name).count()) === 0,
  );
  await tabs.getByRole("button", { name: /^removidos/i }).click();
  await see(`${name} under 'removidos'`, personRow(team, name));

  await page.goto(`${BASE}/equipe/${id}`);
  await see(
    "the read-only banner",
    page.getByRole("status").filter({ hasText: /Removido da equipe/ }),
  );

  await page.goto(`${BASE}/equipe?status=removidos`);
  await page.getByRole("button", { name: `Restaurar ${name}` }).click();
  await poll(
    `${name} to leave 'removidos'`,
    async () => (await personRow(team, name).count()) === 0,
  );
  await tabs.getByRole("button", { name: /^ativos/i }).click();
  await see(`${name} back under 'ativos'`, personRow(team, name));
}

async function teamSearchSortFilter(state: State): Promise<void> {
  const page = await deskOf(state);
  const name = "Seu Antônio E2E";
  await addContract(page, {
    workerName: name,
    occupation: "Jardineiro",
    payType: "Mensal",
    rate: "900000",
    weekdayPreset: "seg a sex",
    startedOn: today().prevMonthStart,
  });

  await page.goto(`${BASE}/equipe`);
  const table = teamTable(page);
  const rows = dataRows(table);
  await see("the team table", rows);
  const everyone = await rows.count();
  if (everyone < 2) throw new Error(`test bug: expected several people, found ${everyone}`);

  const search = table.getByRole("searchbox");
  await search.fill("antonio");
  await poll(
    "the accent-free search to find 'Seu Antônio'",
    async () => (await rows.count()) === 1,
  );
  await see(name, personRow(table, name));
  await search.fill("");
  await poll("the full list again", async () => (await rows.count()) === everyone);

  await table.getByRole("button", { name: /^A pagar/ }).click();
  const column = (await table.locator("thead th").allInnerTexts()).findIndex((t) =>
    /a pagar/i.test(t),
  );
  const due = async () =>
    (await rows.locator(`td:nth-child(${column + 1})`).allInnerTexts()).map(parseCents);
  const sorted = await poll("rows sorted by a pagar, descending", async () => {
    const values = await due();
    const ok = values.every((v, i) => i === 0 || values[i - 1]! >= v);
    return ok && new Set(values).size > 1 && values;
  });
  if (sorted[0]! < 900000)
    throw new Error(`top 'a pagar' is ${sorted[0]}, expected the R$ 9.000,00 monthly salary first`);

  await choose(page, "Função", "Jardineiro");
  await poll("the função filter to leave one person", async () => (await rows.count()) === 1);
  await search.fill("antonio");
  await page.waitForURL(/q=antonio/);

  await page.reload();
  await see("the table after reload", rows);
  const url = new URL(page.url());
  for (const [key, value] of [
    ["q", "antonio"],
    ["ordem", "-apagar"],
    ["funcao", "jardineiro"],
  ] as const) {
    if (url.searchParams.get(key) !== value)
      throw new Error(`after reload ?${key}=${url.searchParams.get(key)}, expected ${value}`);
  }
  if ((await search.inputValue()) !== "antonio")
    throw new Error("search box is empty after reload");
  if ((await rows.count()) !== 1)
    throw new Error(`expected 1 row after reload, found ${await rows.count()}`);
  await see(name, personRow(table, name));
}

async function boardCell(state: State): Promise<void> {
  const id = need(state.contractId, 1);
  const page = await deskOf(state);
  await page.goto(`${BASE}/cartao`);
  const row = page.getByRole("row", { name: new RegExp(WORKER_NAME) });
  await see(`${WORKER_NAME} on the board`, row);

  const dayIndex = await page
    .locator("th.bg__day")
    .evaluateAll((ths) => ths.findIndex((t) => t.getAttribute("aria-current") === "date"));
  if (dayIndex < 0) throw new Error("the board has no column for today");
  const cell = row.locator("td.bg__td").nth(dayIndex).getByRole("button");
  const label = (await cell.getAttribute("aria-label")) ?? "";
  if (!/trabalhou/.test(label))
    throw new Error(`today's cell is labelled "${label}", expected 'trabalhou'`);

  await cell.click();
  const sheet = page.getByRole("dialog");
  await see("the day editor opened in place", sheet.getByText("Pagar este dia agora"));
  if (!page.url().endsWith("/cartao")) throw new Error(`a day click navigated to ${page.url()}`);
  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "hidden" });

  await row.locator("th").first().click();
  await page.waitForURL(new RegExp(`/equipe/${id}`));
}

async function paymentsTable(state: State): Promise<void> {
  const id = need(state.contractId, 1);
  const worker = need(state.worker, 2).page;
  const page = await deskOf(state);
  await registerPayment(page, id, "1200");

  await page.goto(`${BASE}/pagamentos`);
  const table = page.getByRole("region", { name: "Pagamentos" });
  const rows = dataRows(table);
  await see("the payments table", rows);
  const mine = rows.filter({ hasText: WORKER_NAME });
  await poll("both payments listed with the person's name", async () => (await mine.count()) >= 2);

  await choose(page, "Recebido", "Sem “recebi”");
  await poll("only the payment without 'recebi'", async () => (await rows.count()) === 1);
  const text = await textOf(rows);
  if (!text.includes(WORKER_NAME) || !/12,00/.test(text))
    throw new Error(`filtered row is "${text}", expected ${WORKER_NAME} R$ 12,00`);

  await worker.goto(`${BASE}/pagamentos`);
  await see("the 'recebi' button for the worker", action(worker, /^recebi$/i));
}

async function sidebarLogout(state: State): Promise<void> {
  const { page } = await openSession(state, "desk-logout", DESKTOP);
  await login(page, state.employerEmail, PASSWORD);
  await page.waitForURL(`${BASE}/`);
  await see(
    "the user's name in the sidebar",
    page.getByRole("complementary", { name: "Menu lateral" }).getByText(EMPLOYER_NAME),
  );

  // Gives the history a private page to go back to.
  await page
    .getByRole("complementary", { name: "Menu lateral" })
    .getByRole("link", { name: "Equipe" })
    .click();
  await page.waitForURL("**/equipe");
  await action(page.getByRole("complementary", { name: "Menu lateral" }), /^sair$/i).click();
  await page.waitForURL("**/entrar");
  await page.goBack();
  await page.waitForURL("**/entrar**");
  await absent("the user's name after logout", page.getByText(EMPLOYER_NAME));
  await page.goto(`${BASE}/equipe`);
  await page.waitForURL(/\/entrar/);
}

async function legacyUrl(state: State): Promise<void> {
  const id = need(state.contractId, 1);
  const page = await deskOf(state);
  await page.goto(`${BASE}/vinculos/${id}/historico`);
  await page.waitForURL(`${BASE}/equipe/${id}/historico`);
  await see("the history tab", page.getByRole("link", { name: "Histórico" }).first());
}

async function agreement(state: State): Promise<void> {
  const id = need(state.contractId, 1);
  const worker = need(state.worker, 2).page;
  const page = await deskOf(state);

  await page.goto(`${BASE}/equipe/${id}/acordos`);
  await action(page, /^Novo acordo$/).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Descrição").fill("Mesa");
  await sheet.getByLabel("Valor total").fill("60000");
  await sheet.getByLabel("Parcela por mês").fill("20000");
  await action(sheet, /^Criar acordo$/).click();
  await absent("the agreement form", sheet);
  const table = page.getByRole("region", { name: "Acordos" });
  const row = table.getByRole("row").filter({ hasText: "Mesa" });
  await see("the Mesa agreement, waiting for the worker", row.getByText(/aguardando/i));

  await worker.goto(`${BASE}/equipe/${id}/acordos`);
  await action(worker, /^Concordo$/).click();
  await see("the agreement running on the worker side", worker.getByText("em andamento").first());

  await page.reload();
  await see("the agreement running for the employer", row.getByText("em andamento"));
  await action(row, /^Abater parcela de R\$\s*200,00$/).click();
  await page.waitForURL(/\/pagamentos\/novo/);

  const amount = page.getByLabel("Valor", { exact: true });
  await poll("the installment to prefill R$ 200,00", async () =>
    /200,00/.test(await amount.inputValue()),
  );
  const method = page
    .getByRole("radio", { name: "Compensação" })
    .or(page.getByRole("combobox", { name: "Como pagou" }));
  const selected = await method
    .first()
    .evaluate((el) =>
      el instanceof HTMLInputElement ? el.checked : (el.textContent ?? "").includes("Compensação"),
    );
  if (!selected) throw new Error("the payment method is not preselected as Compensação");
  await submitPayment(page);

  await page.goto(`${BASE}/equipe/${id}/acordos`);
  await poll("the agreement to show abatido R$ 200 and falta R$ 400", async () => {
    const text = await textOf(row);
    return /600,00.*200,00.*400,00/.test(text) && text;
  });
}

async function futureMonth(state: State): Promise<void> {
  const page = await deskOf(state);
  await page.goto(BASE);
  await see("the current month KPIs", page.getByRole("region", { name: /^Resumo de/ }));
  await page.getByRole("button", { name: /^Próximo mês/ }).click();

  const forecast = page.getByRole("region", { name: /^Previsão de/ });
  await see("the forecast section", forecast.first());
  const tags = await page.getByText("Previsto", { exact: true }).count();
  if (tags < 2) throw new Error(`expected 2 'previsto' KPI tags (custo, dias), found ${tags}`);
  await absent("the actual-month summary", page.getByRole("region", { name: /^Resumo de/ }));
  await absent(
    "the today and pendencies panel",
    page.getByRole("complementary", { name: "Hoje e pendências" }),
  );
  await absent("the Pendências KPI", page.getByText("Pendências", { exact: true }));
}

async function deleteAccount(state: State): Promise<void> {
  const desk = await deskOf(state);
  const email = `e2e+${RUN}-leaver@emdia.dev`;
  const { id, code } = await addContractWithInvite(desk, {
    workerName: "Saindo E2E",
    payType: "Por diária",
    rate: "10000",
    weekdays: [1, 3, 5],
    startedOn: today().prevMonthStart,
  });

  const { page } = await openSession(state, "leaver");
  await register(page, "Eu trabalho", "Saindo E2E", email, `?convite=${code}`);
  await action(page, /^Criar conta$/i).click();
  await page.waitForURL(`${BASE}/`);
  await action(page, /bater entrada/i).click();
  await see("the check-in time", page.locator('section[aria-label="Hoje"] dd').first());

  await page.goto(`${BASE}/perfil`);
  await action(page, /^Excluir minha conta$/).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Sua senha", { exact: true }).fill(PASSWORD);
  await dialog.getByLabel("Digite EXCLUIR para confirmar").fill("EXCLUIR");
  await action(dialog, /^Excluir conta$/).click();
  await page.waitForURL("**/entrar");
  await see("the deletion toast", page.getByText("Sua conta foi excluída."));

  await login(page, email, PASSWORD);
  await see(
    "a login error for the deleted account",
    page.locator('p[role="alert"]').filter({ hasText: /\w/ }),
  );
  if (!page.url().includes("/entrar")) throw new Error("the deleted account could still sign in");

  await desk.goto(`${BASE}/equipe/${id}/historico`);
  await see("the clock-in still in the employer's history", desk.getByText(/bateu a entrada/));
  await desk.goto(`${BASE}/equipe/${id}`);
  await see(
    "the contract flagged as having no linked worker",
    desk.getByText(/convite pendente/i).first(),
  );
}

async function backNavigation(state: State): Promise<void> {
  const page = await deskOf(state);
  await page.goto(BASE);
  await action(page, /^Registrar pagamento$/)
    .first()
    .click();
  await page.waitForURL(/\/pagamentos\/novo/);
  await action(page, /^voltar$/i)
    .first()
    .click();
  await page.waitForURL(`${BASE}/`);
}

async function signedInInvite(state: State): Promise<void> {
  const desk = await deskOf(state);
  const { code } = await addContractWithInvite(desk, {
    workerName: "Convite E2E",
    payType: "Por diária",
    rate: "10000",
    weekdays: [1],
    startedOn: today().prevMonthStart,
  });

  for (const [who, email, name] of [
    ["employer", state.employerEmail, EMPLOYER_NAME],
    ["worker", state.workerEmail, WORKER_NAME],
  ] as const) {
    const { page } = await openSession(state, `invite-${who}`);
    await login(page, email, PASSWORD);
    await page.waitForURL(`${BASE}/`);
    await page.goto(`${BASE}/criar-conta?convite=${code}`);
    const notice = page.getByRole("status").filter({ hasText: "Você está conectado como" });
    await see(`the signed-in notice for the ${who}`, notice);
    if (!(await textOf(notice)).includes(name.split(" ")[0]!))
      throw new Error(`the notice does not name ${name}`);

    await action(notice, /^Sair e continuar$/).click();
    await page.waitForURL(new RegExp(`/criar-conta\\?convite=${code}`));
    await see("the signup form with the invite", page.getByLabel("Seu nome"));
    const prefilled = await page.getByLabel("Código de convite").inputValue();
    if (prefilled.replace(/\W/g, "").toUpperCase() !== code)
      throw new Error(`invite field holds "${prefilled}", expected ${code}`);
  }
}

async function securityChecks(state: State): Promise<void> {
  const id = need(state.contractId, 1);
  const worker = need(state.worker, 2).page;

  // Workers cannot reach employer-only settings.
  await worker.goto(`${BASE}/equipe/${id}/ajustes`);
  await worker.waitForURL((url) => !url.pathname.endsWith("/ajustes"));
  if (new URL(worker.url()).pathname !== "/")
    throw new Error(`worker ended on ${worker.url()}, expected /`);

  // Anonymous visitors are sent to the login.
  const anon = await openSession(state, "anonymous");
  await anon.page.goto(BASE);
  await anon.page.waitForURL("**/entrar");
  await anon.page.goto(`${BASE}/equipe/${id}`);
  await anon.page.waitForURL(/\/entrar\?next=/);

  // Wrong password shows a message and keeps the user on the form.
  await anon.page.goto(`${BASE}/entrar`);
  await anon.page.getByLabel("E-mail").fill(state.employerEmail);
  await anon.page.getByLabel("Senha", { exact: true }).fill("senha-errada-123");
  await action(anon.page, /^Entrar$/).click();
  const alert = anon.page.locator('p[role="alert"]').filter({ hasText: /\w/ });
  await see("an error for the wrong password", alert);
  if (!anon.page.url().includes("/entrar")) throw new Error("left /entrar after a wrong password");
  const message = await textOf(alert);
  if (/invalid|incorrect|unauthor/i.test(message))
    throw new Error(`error message is not pt-BR: "${message}"`);

  // After logout, going back must not reveal private pages.
  await login(anon.page, state.employerEmail, PASSWORD);
  await anon.page.waitForURL(`${BASE}/`);
  await anon.page.goto(`${BASE}/perfil`);
  await see("the profile", anon.page.getByText(state.employerEmail));
  await action(anon.page, /^sair$/i).click();
  await anon.page.waitForURL("**/entrar");
  await anon.page.goBack();
  await anon.page.waitForURL("**/entrar**");
  await absent("the employer's e-mail after logout", anon.page.getByText(state.employerEmail));
  await anon.page.goto(`${BASE}/equipe/${id}`);
  await anon.page.waitForURL(/\/entrar/);
}

async function forgotPassword(state: State): Promise<void> {
  const { page } = await openSession(state, "reset");
  await page.goto(`${BASE}/esqueci-senha`);
  await page.getByLabel("E-mail").fill(state.employerEmail);
  await action(page, /^Enviar link$/).click();
  await see("the confirmation notice", page.getByText("confira seu e-mail"));

  const { messages } = (await (await fetch(`${API}/dev/outbox`)).json()) as {
    messages: { to: string; text: string }[];
  };
  const mail = messages.find((m) => m.to === state.employerEmail);
  const link = mail?.text.match(/\/redefinir-senha\?token=\S+/)?.[0];
  if (!link) throw new Error("no reset link in the dev outbox for the employer");

  await page.goto(`${BASE}${link}`);
  await page.getByLabel("Senha nova", { exact: true }).fill(NEW_PASSWORD);
  await action(page, /^Salvar senha$/).click();
  await see("the saved-password notice", page.getByText("senha nova salva"));

  await login(page, state.employerEmail, NEW_PASSWORD);
  await page.waitForURL(`${BASE}/`);
  await see(
    "the dashboard after logging in with the new password",
    page.getByRole("heading", { name: "Início", includeHidden: true }),
  );
}

// Runner

const JOURNEYS: [string, (state: State) => Promise<void>][] = [
  ["1  employer signup, add worker, invite code", employerSignup],
  ["2  worker signup via invite, clock in and out", workerClocksIn],
  ["3  employer confirms the day, worker sees it", confirmDay],
  ["4  employer marks a past day as absent", markAbsence],
  ["5  extras change the ledger total", addExtra],
  ["6  payment with receipt, fake .png rejected", createPayment],
  ["7  worker acknowledges the payment", acknowledgePayment],
  ["10 CSV download", downloadCsv],
  ["11 monthly, every day: bulk fill and absence deduction", monthlyAllDays],
  ["12 once a month: visit counter, no placeholders", oncePerMonth],
  ["13 every other Friday matches the shared schedule", biweekly],
  ["14 contact e-mail and phone: estimate, e-mail sent, WhatsApp", contactInvite],
  ["15 remove and restore from the team table", removeAndRestore],
  ["16 team search, sort and filter survive a reload", teamSearchSortFilter],
  ["17 board cell opens the day in place, row opens the person", boardCell],
  ["18 payments table lists, filters, worker sees recebi", paymentsTable],
  ["20 old /vinculos URL redirects to /equipe", legacyUrl],
  ["21 agreement: create, worker agrees, installment payment", agreement],
  ["22 future month shows forecast KPIs only", futureMonth],
  ["23 worker deletes the account, employer keeps the history", deleteAccount],
  ["24 voltar from a payment form returns to Início", backNavigation],
  ["25 invite link while signed in offers 'Sair e continuar'", signedInInvite],
  ["19 sidebar logout, back shows nothing private", sidebarLogout],
  ["8  security and logout checks", securityChecks],
  ["9  forgot password and login with the new one", forgotPassword],
];

async function screenshotAll(slug: string): Promise<string[]> {
  const paths: string[] = [];
  for (const { label, page } of sessions) {
    if (page.isClosed() || page.url() === "about:blank") continue;
    const path = join(OUT, `fail-${slug}-${label}.png`);
    await page.screenshot({ path }).then(
      () => paths.push(path),
      () => {},
    );
  }
  return paths;
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  const state: State = {
    browser,
    employerEmail: `e2e+${RUN}-employer@emdia.dev`,
    workerEmail: `e2e+${RUN}-worker@emdia.dev`,
  };

  let failed = 0;
  for (const [name, journey] of JOURNEYS) {
    const slug = name.split(" ")[0]!;
    try {
      await journey(state);
      console.log(`PASS  ${name}`);
    } catch (e) {
      failed++;
      const shots = await screenshotAll(`j${slug}`);
      console.log(`FAIL  ${name}\n      ${(e as Error).message.split("\n").join("\n      ")}`);
      for (const shot of shots) console.log(`      screenshot: ${shot}`);
    }
  }
  await browser.close();

  if (problems.length > 0) {
    console.log(`\nBrowser problems (${problems.length}):`);
    for (const p of new Set(problems)) console.log(`  ${p}`);
  }
  console.log(`\n${JOURNEYS.length - failed}/${JOURNEYS.length} journeys passed`);
  process.exit(failed > 0 || problems.length > 0 ? 1 : 0);
}

await main();
