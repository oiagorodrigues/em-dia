import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { computeMonthSummary, type YearMonth } from "@emdia/shared";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { expect, test } from "vite-plus/test";
import { migrationsFolder } from "../src/db/migrations.ts";
import * as schema from "../src/db/schema.ts";
import { contractsRepo } from "../src/repos/contracts.ts";
import { entriesRepo } from "../src/repos/entries.ts";
import { householdsRepo } from "../src/repos/households.ts";
import { paymentsRepo } from "../src/repos/payments.ts";
import { usersRepo } from "../src/repos/users.ts";

/** drizzle/ as it was before 0003, so legacy rows can be written in the old shape. */
function foldersUpTo(tag: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "emdia-legacy-"));
  cpSync(migrationsFolder(), dir, { recursive: true });
  const journalPath = join(dir, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: { tag: string }[];
  };
  const last = journal.entries.findIndex((e) => e.tag === tag);
  journal.entries = journal.entries.slice(0, last + 1);
  writeFileSync(journalPath, JSON.stringify(journal));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("0003 turns adjustments and extra payments into payment kinds without moving any month", async () => {
  const legacy = foldersUpTo("0002_payments_confirm_extra");
  const client = await PGlite.create("memory://");
  const db = drizzle({ client, schema });
  try {
    await migrate(db, { migrationsFolder: legacy.dir });

    const at = "2026-08-01T12:00:00.000Z";
    await usersRepo(db).insert({
      id: "u1",
      email: "ana@test.dev",
      name: "Ana",
      role: "employer",
      passwordHash: "x",
      createdAt: at,
    });
    await householdsRepo(db).insert({
      id: "h1",
      ownerId: "u1",
      name: "Casa",
      timezone: "America/Sao_Paulo",
      createdAt: at,
    });
    // Raw SQL: the repository writes today's columns, which a 0002 database doesn't have yet.
    await db.execute(sql`
      INSERT INTO contracts (id, household_id, worker_name, occupation, pay_type, rate_cents,
        schedule_kind, deduct_absences, started_on, status, created_at)
      VALUES ('c1', 'h1', 'Maria', 'diarista', 'monthly', 150000, 'on_demand', false,
        '2026-08-01', 'active', ${at})
    `);
    await db.execute(sql`
      INSERT INTO adjustments (id, contract_id, month, kind, amount_cents, description, created_by, created_at) VALUES
        ('a1', 'c1', '2026-08', 'bonus', 10000, 'Festa', 'u1', '2026-08-20T02:00:00Z'),
        ('a2', 'c1', '2026-08', 'transport', 4000, NULL, 'u1', '2026-08-03T12:00:00Z'),
        ('a3', 'c1', '2026-09', 'advance', 30000, 'Pediu no dia 10', 'u1', '2026-09-10T12:00:00Z'),
        ('a4', 'c1', '2026-09', 'advance', 2000, NULL, 'u1', '2026-09-11T12:00:00Z'),
        ('a5', 'c1', '2026-09', 'deduction', 5000, 'Uniforme', 'u1', '2026-09-12T12:00:00Z')
    `);
    await db.execute(sql`
      INSERT INTO payments (id, contract_id, reference_month, paid_on, amount_cents, method, is_extra, acknowledged_at, created_by, created_at) VALUES
        ('p1', 'c1', '2026-08', '2026-09-05', 164000, 'pix', false, '2026-09-05T20:00:00Z', 'u1', '2026-09-05T12:00:00Z'),
        ('p2', 'c1', '2026-09', '2026-09-20', 8000, 'cash', true, NULL, 'u1', '2026-09-20T12:00:00Z'),
        ('p3', 'c1', '2026-09', '2026-10-05', 100000, 'transfer', false, NULL, 'u1', '2026-10-05T12:00:00Z')
    `);

    // What the old pay math showed: due = earned + bonus + transport - advance - deduction
    // + extra payments; paid = every payment.
    const before: Record<YearMonth, { due: number; paid: number }> = {
      "2026-08": { due: 150000 + 10000 + 4000, paid: 164000 },
      "2026-09": { due: 150000 - 30000 - 2000 - 5000 + 8000, paid: 8000 + 100000 },
    };

    await migrate(db, { migrationsFolder: migrationsFolder() });

    const located = await contractsRepo(db).findById("c1");
    if (!located) throw new Error("contract missing");
    for (const month of Object.keys(before)) {
      const summary = computeMonthSummary({
        contract: located.contract,
        month,
        entries: await entriesRepo(db).listByMonth("c1", month),
        payments: await paymentsRepo(db).listByMonth("c1", month),
        today: "2026-10-06",
      });
      expect({ month, due: summary.dueCents, paid: summary.paidCents }).toEqual({
        month,
        ...before[month],
      });
    }

    const rows = await paymentsRepo(db).list("c1", undefined);
    const byId = new Map(rows.map((p) => [p.id, p]));
    expect(byId.get("a1")).toMatchObject({
      kind: "bonus",
      method: null,
      note: "Festa",
      referenceMonth: "2026-08",
      // 02:00 UTC is still the 19th in São Paulo.
      paidOn: "2026-08-19",
    });
    expect(byId.get("a2")).toMatchObject({ kind: "transport", method: null, note: null });
    expect(byId.get("a3")).toMatchObject({
      kind: "deduction",
      method: null,
      note: "Adiantamento (vale): Pediu no dia 10",
    });
    expect(byId.get("a4")?.note).toBe("Adiantamento (vale)");
    expect(byId.get("a5")).toMatchObject({ kind: "deduction", note: "Uniforme" });
    expect(byId.get("p1")).toMatchObject({ kind: "pay", method: "pix" });
    expect(byId.get("p1")?.acknowledgedAt).not.toBeNull();
    expect(byId.get("p2")).toMatchObject({ kind: "bonus", method: "cash" });

    const tables = await db.execute(
      sql`SELECT 1 FROM information_schema.tables WHERE table_name = 'adjustments'`,
    );
    expect(tables.rows).toHaveLength(0);
  } finally {
    await client.close();
    legacy.cleanup();
  }
}, 60_000);
