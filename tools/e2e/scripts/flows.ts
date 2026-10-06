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

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const API = process.env.API_URL ?? "http://localhost:3000/api/v1";
const OUT = new URL("../out/", import.meta.url).pathname;
const TIMEZONE = "America/Sao_Paulo";
const VIEWPORT = { width: 390, height: 844 };
const TIMEOUT = 8_000;

const RUN = Date.now();
const PASSWORD = "ponto12345";
const NEW_PASSWORD = "outrasenha987";
const EMPLOYER_NAME = "Dona E2E";
const WORKER_NAME = "Rosa E2E";

interface Session {
  context: BrowserContext;
  page: Page;
}

interface State {
  browser: Browser;
  employerEmail: string;
  workerEmail: string;
  employer?: Session;
  worker?: Session;
  inviteCode?: string;
  contractId?: string;
  receiptPng?: string;
}

const problems: string[] = [];
const sessions: Session[] = [];

// Known, intended failures: anonymous session restore (401), wrong password (401), rejected upload (415).
const EXPECTED_CONSOLE = /status of (401|415)/;

async function openSession(state: State, label: string): Promise<Session> {
  const context = await state.browser.newContext({ viewport: VIEWPORT, locale: "pt-BR" });
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
  const session = { context, page };
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
async function choose(root: Page | Locator, group: string, option: string): Promise<void> {
  await root.getByRole("radiogroup", { name: group }).getByText(option, { exact: true }).click();
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
  await action(page, /^entrar$/).click();
}

function todayRow(page: Page): Locator {
  return page.locator('button[aria-current="date"]');
}

// Journeys

async function employerSignup(state: State): Promise<void> {
  const { page } = (state.employer = await openSession(state, "employer"));
  await register(page, "Eu contrato", EMPLOYER_NAME, state.employerEmail);
  await action(page, /^criar conta$/).click();
  await page.waitForURL("**/vinculos/novo");

  await page.goto(BASE);
  await see("the empty dashboard", page.getByText("Ninguém cadastrado ainda."));
  await action(page, /adicionar profissional/).click();
  await page.waitForURL("**/vinculos/novo");

  await page.getByLabel("Nome de quem trabalha").fill(WORKER_NAME);
  await choose(page, "Função", "Diarista");
  await choose(page, "Como paga", "Por diária");
  await page.getByLabel("Valor da diária").fill("15000");

  // Monday, Wednesday, Friday regardless of the form default.
  const days = page.getByRole("group", { name: "Dias que vem" }).getByRole("button");
  for (const [i, wanted] of [true, false, true, false, true, false, false].entries()) {
    const on = (await days.nth(i).getAttribute("aria-pressed")) === "true";
    if (on !== wanted) await days.nth(i).click();
  }

  // Starts last month, so past scheduled days always exist for the absence journey.
  await page.getByLabel("Começou em").fill(today().prevMonthStart);
  await action(page, /cadastrar e gerar convite/).click();

  const invite = page.getByRole("region", { name: "Código de convite" });
  await see("the invite code", invite.locator(".inv__code"));
  const code = (await invite.locator(".inv__code").innerText()).replace(/\s/g, "");
  if (!/^[A-Z0-9]{8}$/.test(code)) throw new Error(`invite code "${code}" is not 8 letters/digits`);
  state.inviteCode = code;

  await action(page, /abrir o cartão/).click();
  await page.waitForURL(/\/vinculos\/(?!novo)[^/]+$/);
  state.contractId = page.url().split("/").pop()!;
  await see("the worker name on the card", page.getByRole("heading", { name: WORKER_NAME }));
}

async function workerClocksIn(state: State): Promise<void> {
  const code = need(state.inviteCode, 1);
  const { page } = (state.worker = await openSession(state, "worker"));
  await register(page, "Eu trabalho", WORKER_NAME, state.workerEmail, `?convite=${code}`);
  await action(page, /^criar conta$/).click();
  await page.waitForURL(`${BASE}/`);
  await see("the employer's house on the worker home", page.getByText(EMPLOYER_NAME).first());

  await action(page, /bater entrada/).click();
  const row = page.locator('section[aria-label="Hoje"]');
  const columns = row.locator("dd");
  await poll("a check-in time in today's row", async () =>
    /\d{2}:\d{2}/.test(await textOf(columns.nth(0))),
  );

  await action(page, /bater saída/).click();
  await poll("a check-out time in today's row", async () =>
    /\d{2}:\d{2}/.test(await textOf(columns.nth(1))),
  );
  await see("the closed day", action(page, /dia fechado/));
}

async function confirmDay(state: State): Promise<void> {
  const id = need(state.contractId, 1);
  const { page } = need(state.employer, 1);
  const worker = need(state.worker, 2).page;

  await page.goto(`${BASE}/vinculos/${id}`);
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
  await action(dialog, /^confirmar$/).click();
  await absent("the day editor", dialog);
  await see(
    "today confirmed",
    page.locator('button[aria-current="date"][aria-label$="confirmado"]'),
  );

  await todayRow(page).click();
  await see("'confirmado' in the day editor", dialog.getByText(/^confirmado/));
  await action(dialog, "Fechar").click();

  await worker.goto(`${BASE}/vinculos/${id}`);
  await see(
    "today confirmed on the worker side",
    worker.locator('button[aria-current="date"][aria-label$="confirmado"]'),
  );
  await worker.goto(BASE);
  await see("the worker home", action(worker, /ver cartão/));
  await absent("the pending-confirmation note", worker.getByText(/aguardando confirmação/));
}

async function markAbsence(state: State): Promise<void> {
  const { page } = need(state.employer, 1);
  await page.goto(`${BASE}/vinculos/${need(state.contractId, 1)}?mes=${today().prevMonth}`);

  const missing = page.getByRole("button", { name: /dia previsto sem registro/ });
  await see("a past scheduled day without a record in the previous month", missing);
  await missing.first().click();

  const dialog = page.getByRole("dialog");
  await choose(dialog, "O que aconteceu", "Faltou");
  await action(dialog, /^anotar$/).click();
  await absent("the day editor", dialog);

  const absentRow = page.getByRole("button", { name: /Faltou/ });
  await see("the absence row", absentRow);
  await see("the FALTA stamp", absentRow.getByText(/^falta$/i));
}

async function addExtra(state: State): Promise<void> {
  const { page } = need(state.employer, 1);
  const id = need(state.contractId, 1);
  const total = page.locator(".ledger__total dd");

  await page.goto(`${BASE}/vinculos/${id}`);
  await see("the monthly total", total);
  const before = parseCents(await textOf(total));

  await page.goto(`${BASE}/vinculos/${id}/extras`);
  await choose(page, "Tipo", "Vale-transporte");
  await page.getByLabel("Valor", { exact: true }).fill("2000");
  await action(page, /^lançar em/).click();
  await see("the new entry in the list", page.getByRole("list").getByText("Vale-transporte"));
  await see("the extras net", page.getByText("saldo dos lançamentos"));
  const net = await textOf(page.locator(".ex__net .mono"));
  if (parseCents(net) !== 2000) throw new Error(`extras net is "${net}", expected R$ 20,00`);

  await page.goto(`${BASE}/vinculos/${id}`);
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
  await action(page, /^registrar pagamento$/).click();
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
  await action(page, /^registrar pagamento$/).click();
  await page.waitForURL(/\/vinculos\/[^/]+\/pagamentos/);

  await see("the payment stub", page.getByRole("article", { name: /Pagamento de R\$\s*50,00/ }));
  const stubs = await page.getByRole("article").count();
  if (stubs !== 1)
    throw new Error(
      `expected 1 payment after one rejected and one accepted upload, found ${stubs}`,
    );

  await action(page, /ver comprovante/).click();
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

  await worker.goto(`${BASE}/vinculos/${id}/pagamentos`);
  await action(worker, /^recebi$/).click();
  await see("the worker's 'recebido' stamp", worker.getByText(/recebido/i));

  await employer.goto(`${BASE}/vinculos/${id}/pagamentos`);
  await see(
    "'recebido' on the employer side",
    employer.getByRole("article").getByText(/recebido/i),
  );
}

async function downloadCsv(state: State): Promise<void> {
  const { page } = need(state.employer, 1);
  await page.goto(`${BASE}/vinculos/${need(state.contractId, 1)}`);
  const button = action(page, /baixar planilha/);
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

async function securityChecks(state: State): Promise<void> {
  const id = need(state.contractId, 1);
  const worker = need(state.worker, 2).page;

  // Workers cannot reach employer-only settings.
  await worker.goto(`${BASE}/vinculos/${id}/ajustes`);
  await worker.waitForURL((url) => !url.pathname.endsWith("/ajustes"));
  if (new URL(worker.url()).pathname !== "/")
    throw new Error(`worker ended on ${worker.url()}, expected /`);

  // Anonymous visitors are sent to the login.
  const anon = await openSession(state, "anonymous");
  await anon.page.goto(BASE);
  await anon.page.waitForURL("**/entrar");
  await anon.page.goto(`${BASE}/vinculos/${id}`);
  await anon.page.waitForURL(/\/entrar\?next=/);

  // Wrong password shows a message and keeps the user on the form.
  await anon.page.goto(`${BASE}/entrar`);
  await anon.page.getByLabel("E-mail").fill(state.employerEmail);
  await anon.page.getByLabel("Senha", { exact: true }).fill("senha-errada-123");
  await action(anon.page, /^entrar$/).click();
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
  await action(anon.page, /^sair$/).click();
  await anon.page.waitForURL("**/entrar");
  await anon.page.goBack();
  await anon.page.waitForURL("**/entrar**");
  await absent("the employer's e-mail after logout", anon.page.getByText(state.employerEmail));
  await anon.page.goto(`${BASE}/vinculos/${id}`);
  await anon.page.waitForURL(/\/entrar/);
}

async function forgotPassword(state: State): Promise<void> {
  const { page } = await openSession(state, "reset");
  await page.goto(`${BASE}/esqueci-senha`);
  await page.getByLabel("E-mail").fill(state.employerEmail);
  await action(page, /^enviar link$/).click();
  await see("the confirmation notice", page.getByText("confira seu e-mail"));

  const { messages } = (await (await fetch(`${API}/dev/outbox`)).json()) as {
    messages: { to: string; text: string }[];
  };
  const mail = messages.find((m) => m.to === state.employerEmail);
  const link = mail?.text.match(/\/redefinir-senha\?token=\S+/)?.[0];
  if (!link) throw new Error("no reset link in the dev outbox for the employer");

  await page.goto(`${BASE}${link}`);
  await page.getByLabel("Senha nova", { exact: true }).fill(NEW_PASSWORD);
  await action(page, /^salvar senha$/).click();
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
  ["8  security and logout checks", securityChecks],
  ["9  forgot password and login with the new one", forgotPassword],
];

async function screenshotAll(slug: string): Promise<string[]> {
  const paths: string[] = [];
  for (const [i, { page }] of sessions.entries()) {
    if (page.isClosed()) continue;
    const path = join(OUT, `fail-${slug}-${i}.png`);
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
    employerEmail: `e2e+${RUN}-employer@ponto.dev`,
    workerEmail: `e2e+${RUN}-worker@ponto.dev`,
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
