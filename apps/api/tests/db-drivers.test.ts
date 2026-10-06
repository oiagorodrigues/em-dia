import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { openDatabase, pendingMigrations, type Database } from "../src/db/index.ts";
import { households, users, workEntries, contracts } from "../src/db/schema.ts";
import { createRepos, isDuplicateEmail } from "../src/repos/index.ts";
import journal from "../drizzle/meta/_journal.json" with { type: "json" };

/**
 * The same contract for every driver. PGlite always runs; set
 * EMDIA_TEST_POSTGRES_URL (e.g. a postgres:latest container) to also run it on
 * node-postgres. That database is dropped and recreated (schema `public`).
 */
const postgresUrl = process.env.EMDIA_TEST_POSTGRES_URL;
const drivers: [string, () => Promise<Database>][] = [
  ["pglite", () => openDatabase("pglite:memory")],
  ...(postgresUrl
    ? [["node-postgres", () => openDatabase(postgresUrl)] as [string, () => Promise<Database>]]
    : []),
];

async function wipe(database: Database) {
  await database.db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await database.db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await database.db.execute(sql`CREATE SCHEMA public`);
}

describe.each(drivers)("%s", (driver, open) => {
  let database: Database;
  const others: Database[] = [];

  beforeAll(async () => {
    database = await open();
    await wipe(database);
  });
  afterAll(async () => {
    for (const d of [database, ...others]) await d.close();
  });

  test("reports its driver and starts with every migration pending", async () => {
    expect(database.driver).toBe(driver);
    expect((await pendingMigrations(database.db)).length).toBeGreaterThan(0);
  });

  test("migrations apply once, also when several runs race", async () => {
    // PGlite is single-process, so its race happens on one instance; Postgres races separate pools.
    const runners =
      driver === "pglite"
        ? [database, database, database]
        : [database, ...(await Promise.all([open(), open()]))];
    others.push(...runners.filter((r) => r !== database));
    const applied = await Promise.all(runners.map((r) => r.migrate()));
    expect(applied.flat()).toEqual(journal.entries.map((e) => e.tag));
    expect(await database.migrate()).toEqual([]);
    expect(await pendingMigrations(database.db)).toEqual([]);
  });

  test("timestamps, dates and jsonb round-trip as the domain expects", async () => {
    const repos = createRepos(database);
    await repos.users.insert({
      id: "u1",
      email: "ana@test.dev",
      name: "Ana",
      role: "employer",
      passwordHash: "x",
      createdAt: "2026-10-06T15:00:00.123Z",
    });
    expect((await repos.users.findById("u1"))?.createdAt).toBe("2026-10-06T15:00:00.123Z");

    await repos.households.insert({
      id: "h1",
      ownerId: "u1",
      name: "Casa",
      timezone: "America/Sao_Paulo",
      createdAt: "2026-10-06T15:00:00.000Z",
    });
    await repos.contracts.insert({
      id: "c1",
      householdId: "h1",
      createdAt: "2026-10-06T15:00:00.000Z",
      workerName: "Maria",
      occupation: "diarista",
      payType: "daily",
      rateCents: 18000,
      schedule: {
        kind: "weekly",
        weekdays: [2, 5],
        everyWeeks: 2,
        monthDays: [],
        visitsPerMonth: null,
      },
      deductAbsences: true,
      contactEmail: null,
      contactPhone: null,
      expectedStart: "08:00",
      expectedEnd: "16:00",
      startedOn: "2026-08-01",
    });
    const located = await repos.contracts.findById("c1");
    expect(located?.contract).toMatchObject({
      schedule: { kind: "weekly", weekdays: [2, 5], everyWeeks: 2 },
      startedOn: "2026-08-01",
      employerName: "Ana",
      workerPhone: null,
    });

    await repos.entries.save({
      id: "e1",
      contractId: "c1",
      date: "2026-09-30",
      status: "worked",
      checkIn: "08:00",
      checkOut: "16:00",
      breakMinutes: 60,
      minutes: 420,
      note: null,
      createdBy: "u1",
      createdByRole: "employer",
      confirmedBy: null,
      confirmedAt: null,
      updatedAt: "2026-09-30T20:00:00.000Z",
    });
    expect((await repos.entries.listByMonth("c1", "2026-09")).map((e) => e.date)).toEqual([
      "2026-09-30",
    ]);
    expect(await repos.entries.listByMonth("c1", "2026-10")).toEqual([]);
  });

  test("a transaction commits everything or nothing", async () => {
    const repos = createRepos(database);
    await expect(
      repos.tx(async (r) => {
        await r.households.update("h1", { name: "Mudou", timezone: "UTC" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect((await repos.households.findById("h1"))?.name).toBe("Casa");

    await repos.tx(async (r) => {
      await r.households.update("h1", { name: "Casa nova", timezone: "America/Sao_Paulo" });
      await r.contracts.end("c1", "2026-12-31");
    });
    expect((await repos.households.findById("h1"))?.name).toBe("Casa nova");
    expect((await repos.contracts.findById("c1"))?.contract.status).toBe("ended");
  });

  test("constraints from the schema are enforced", async () => {
    const repos = createRepos(database);
    const duplicate = repos.users.insert({
      id: "u2",
      email: "ana@test.dev",
      name: "Outra",
      role: "worker",
      passwordHash: "x",
      createdAt: "2026-10-06T15:00:00.000Z",
    });
    const err = await duplicate.catch((e: unknown) => e);
    expect(isDuplicateEmail(err)).toBe(true);

    await expect(
      database.db.update(contracts).set({ rateCents: 0 }).where(eq(contracts.id, "c1")),
    ).rejects.toThrow();
    await expect(
      database.db.update(workEntries).set({ checkIn: "25:00" }).where(eq(workEntries.id, "e1")),
    ).rejects.toThrow();
  });

  test("foreign keys cascade from a household to its contracts and their history", async () => {
    await database.db.delete(households).where(eq(households.id, "h1"));
    expect(await database.db.select().from(workEntries)).toEqual([]);
    await database.db.delete(users).where(eq(users.id, "u1"));
  });
});
