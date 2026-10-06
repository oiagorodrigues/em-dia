/**
 * Drives the running app (`bun run dev`) with the system Chrome and writes
 * screenshots plus a report of console errors and failed requests, so an agent
 * can look at the UI without a human.
 *
 *   bun run screens [--out dir] [--only employer|worker|public]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const API = process.env.API_URL ?? "http://localhost:3000/api/v1";
const PASSWORD = process.env.SEED_PASSWORD ?? "ponto12345";
const args = process.argv.slice(2);
const OUT = args.includes("--out") ? args[args.indexOf("--out") + 1]! : "screens";
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1280, height: 860 },
} as const;
const THEMES = ["light", "dark"] as const;

const problems: string[] = [];

async function contractIds(email: string): Promise<string[]> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${email} failed: ${res.status}`);
  const { accessToken } = (await res.json()) as { accessToken: string };
  const list = await fetch(`${API}/contracts`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const { contracts } = (await list.json()) as { contracts: { id: string }[] };
  return contracts.map((c) => c.id);
}

function watch(page: Page, label: string) {
  page.on("console", (msg) => {
    // Anonymous session restore answers 401 by design.
    if (msg.text().includes("status of 401")) return;
    if (msg.type() === "error" || msg.type() === "warning")
      problems.push(`[${label}] console.${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (err) => problems.push(`[${label}] pageerror: ${err.message}`));
  page.on("response", (res) => {
    if (res.status() >= 500) problems.push(`[${label}] ${res.status()} ${res.url()}`);
  });
}

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/entrar`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/entrar"), { timeout: 10_000 });
}

async function shoot(page: Page, name: string, fullPage = true) {
  // networkidle never settles: the Vite dev server keeps an HMR socket open.
  await page.waitForLoadState("load");
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, `${name}.png`), fullPage });
}

async function session(
  browser: Browser,
  role: string,
  vp: keyof typeof VIEWPORTS,
  theme: (typeof THEMES)[number],
  run: (page: Page, prefix: string) => Promise<void>,
) {
  const context = await browser.newContext({
    viewport: VIEWPORTS[vp],
    colorScheme: theme,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  });
  const page = await context.newPage();
  const prefix = `${role}-${vp}-${theme}`;
  watch(page, prefix);
  try {
    await run(page, prefix);
  } catch (err) {
    problems.push(`[${prefix}] FAILED: ${(err as Error).message}`);
    await page.screenshot({ path: join(OUT, `${prefix}-FAILED.png`) }).catch(() => {});
  }
  await context.close();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const [employerContracts, workerContracts] = await Promise.all([
    contractIds("ana@ponto.dev"),
    contractIds("maria@ponto.dev"),
  ]);
  const contractId = employerContracts[0];

  for (const vp of Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]) {
    for (const theme of THEMES) {
      if (!ONLY || ONLY === "public") {
        await session(browser, "public", vp, theme, async (page, p) => {
          await page.goto(`${BASE}/entrar`);
          await shoot(page, `${p}-entrar`);
          await page.goto(`${BASE}/criar-conta`);
          await shoot(page, `${p}-criar-conta`);
        });
      }
      if (!ONLY || ONLY === "employer") {
        await session(browser, "employer", vp, theme, async (page, p) => {
          await login(page, "ana@ponto.dev");
          await shoot(page, `${p}-inicio`);
          if (!contractId) return;
          for (const tab of ["", "/pagamentos", "/extras", "/historico", "/ajustes"]) {
            await page.goto(`${BASE}/vinculos/${contractId}${tab}?mes=2026-09`);
            await shoot(page, `${p}-vinculo${tab.replace("/", "-") || "-cartao"}`);
          }
          await page.goto(`${BASE}/vinculos/novo`);
          await shoot(page, `${p}-novo-vinculo`);
          await page.goto(`${BASE}/pagamentos/novo?vinculo=${contractId}`);
          await shoot(page, `${p}-novo-pagamento`);
          await page.goto(`${BASE}/perfil`);
          await shoot(page, `${p}-perfil`);
        });
      }
      if (!ONLY || ONLY === "worker") {
        await session(browser, "worker", vp, theme, async (page, p) => {
          await login(page, "maria@ponto.dev");
          await shoot(page, `${p}-inicio`);
          for (const path of ["/cartao", "/pagamentos", "/perfil"]) {
            await page.goto(`${BASE}${path}`);
            await shoot(page, `${p}${path.replace("/", "-")}`);
          }
          if (workerContracts[0]) {
            await page.goto(`${BASE}/vinculos/${workerContracts[0]}/ajustes`);
            await page.waitForTimeout(900);
            if (page.url().includes("/ajustes"))
              problems.push(`[${p}] worker reached /ajustes (should be redirected)`);
          }
        });
      }
    }
  }

  await browser.close();
  const report = problems.length ? problems.join("\n") : "no problems";
  await writeFile(join(OUT, "report.txt"), report + "\n");
  console.log(report);
  process.exitCode = problems.length ? 1 : 0;
}

await main();
