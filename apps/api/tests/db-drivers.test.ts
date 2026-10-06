import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { migrate, openDatabase, pendingMigrations, type Database } from "../src/db/index.ts";
import { createLibsqlDatabase, retryWhileBusy } from "../src/db/libsql.ts";
import { migrations } from "../src/db/migrations/index.ts";

/**
 * Both drivers must behave identically. libSQL runs on a local file; set
 * EMDIA_TEST_LIBSQL_URL (e.g. a `sqld` container at http://127.0.0.1:8080) to
 * also run the contract over the HTTP protocol Turso speaks. That database is
 * wiped before each test.
 */
const remoteUrl = process.env.EMDIA_TEST_LIBSQL_URL;
const drivers: [string, (dir: string) => Database][] = [
  ["node-sqlite", () => openDatabase(":memory:")],
  ["libsql", (dir) => createLibsqlDatabase(`file:${join(dir, "contract.db")}`)],
  ...(remoteUrl
    ? [["libsql (remote)", () => createLibsqlDatabase(remoteUrl)] as [string, () => Database]]
    : []),
];

async function wipe(db: Database) {
  const tables = await db.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_litestream%'",
  );
  if (tables.length === 0) return;
  // One script: over HTTP each separate statement may run on its own connection, and the pragma is per connection.
  await db.exec(
    [
      "PRAGMA foreign_keys = OFF",
      ...tables.map(({ name }) => `DROP TABLE IF EXISTS "${name}"`),
    ].join(";\n"),
  );
}

describe.each(drivers)("%s driver", (name, open) => {
  let dir: string;
  let db: Database;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "emdia-driver-"));
    db = open(dir);
    await wipe(db);
    await db.exec(`
      CREATE TABLE things (id TEXT PRIMARY KEY, n INTEGER NOT NULL, note TEXT) STRICT;
      CREATE TABLE uniq (email TEXT NOT NULL UNIQUE) STRICT;
    `);
  });
  afterEach(async () => {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("reports its driver", () => {
    expect(db.driver).toBe(name.split(" ")[0]);
  });

  test("get / all / run with parameters, nulls and change counts", async () => {
    expect(
      await db.run(
        "INSERT INTO things (id, n, note) VALUES (?, ?, ?), (?, ?, ?)",
        "a",
        1,
        null,
        "b",
        2,
        "x",
      ),
    ).toBe(2);
    expect(await db.get("SELECT * FROM things WHERE id = ?", "a")).toEqual({
      id: "a",
      n: 1,
      note: null,
    });
    expect(await db.get("SELECT * FROM things WHERE id = ?", "zzz")).toBeUndefined();
    expect(await db.all<{ id: string }>("SELECT id FROM things ORDER BY id")).toEqual([
      { id: "a" },
      { id: "b" },
    ]);
    expect(await db.run("UPDATE things SET n = n + 1 WHERE n > ?", 0)).toBe(2);
    expect(await db.get("UPDATE things SET n = 10 WHERE id = ? RETURNING n", "b")).toEqual({
      n: 10,
    });
  });

  test("a transaction commits everything or nothing", async () => {
    await db.transaction(async (tx) => {
      await tx.run("INSERT INTO things (id, n) VALUES ('ok', 1)");
      await tx.run("INSERT INTO things (id, n) VALUES ('ok2', 2)");
    });
    await expect(
      db.transaction(async (tx) => {
        await tx.run("INSERT INTO things (id, n) VALUES ('lost', 3)");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const ids = (await db.all<{ id: string }>("SELECT id FROM things ORDER BY id")).map(
      (r) => r.id,
    );
    expect(ids).toEqual(["ok", "ok2"]);
  });

  test("a constraint error inside a transaction rolls it back with SQLite's message", async () => {
    await db.run("INSERT INTO uniq (email) VALUES ('a@b.co')");
    const failure = db.transaction(async (tx) => {
      await tx.run("INSERT INTO things (id, n) VALUES ('half', 1)");
      await tx.run("INSERT INTO uniq (email) VALUES ('a@b.co')");
    });
    await expect(failure).rejects.toThrow(/UNIQUE constraint failed: uniq\.email/);
    expect(await db.get("SELECT id FROM things WHERE id = 'half'")).toBeUndefined();
  });

  test("concurrent transactions are serialised, not interleaved", async () => {
    await db.run("INSERT INTO things (id, n) VALUES ('counter', 0)");
    const bump = () =>
      db.transaction(async (tx) => {
        const row = await tx.get<{ n: number }>("SELECT n FROM things WHERE id = 'counter'");
        await new Promise((resolve) => setTimeout(resolve, 5));
        await tx.run("UPDATE things SET n = ? WHERE id = 'counter'", (row?.n ?? 0) + 1);
      });
    await Promise.all([bump(), bump(), bump(), bump()]);
    expect(await db.get("SELECT n FROM things WHERE id = 'counter'")).toEqual({ n: 4 });
  });

  test("migrations apply once, also when two runs race", async () => {
    const [first, second] = await Promise.all([migrate(db), migrate(db)]);
    expect([...first, ...second].sort()).toEqual(migrations.map((m) => m.id).sort());
    expect(await migrate(db)).toEqual([]);
    expect(await pendingMigrations(db)).toEqual([]);
  });

  test("pending migrations are listed before migrating", async () => {
    expect(await pendingMigrations(db)).toEqual(migrations.map((m) => m.id));
    await migrate(db, migrations.slice(0, 2));
    expect(await pendingMigrations(db)).toEqual(migrations.slice(2).map((m) => m.id));
  });
});

test("openDatabase picks libSQL for remote URLs and node:sqlite for paths", async () => {
  const local = openDatabase(":memory:");
  expect(local.driver).toBe("node-sqlite");
  await local.close();
  const remote = openDatabase("libsql://example-org.turso.io", "token");
  expect(remote.driver).toBe("libsql");
  await remote.close();
});

describe("retryWhileBusy", () => {
  const busy = () => Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" });

  test("retries SQLITE_BUSY until the transaction gets through", async () => {
    let calls = 0;
    const result = await retryWhileBusy(
      async () => {
        calls++;
        if (calls < 3) throw busy();
        return "committed";
      },
      { backoffMs: 1 },
    );
    expect(result).toBe("committed");
    expect(calls).toBe(3);
  });

  test("gives up after the retry budget and never retries other errors", async () => {
    let calls = 0;
    await expect(
      retryWhileBusy(
        async () => {
          calls++;
          throw busy();
        },
        { retries: 2, backoffMs: 1 },
      ),
    ).rejects.toThrow("database is locked");
    expect(calls).toBe(3);

    let other = 0;
    await expect(
      retryWhileBusy(async () => {
        other++;
        throw new Error("UNIQUE constraint failed: users.email");
      }),
    ).rejects.toThrow(/UNIQUE/);
    expect(other).toBe(1);
  });
});
