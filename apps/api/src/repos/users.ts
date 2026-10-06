import type { PublicUser, Role } from "@emdia/shared";
import { eq, sql } from "drizzle-orm";
import type { Executor } from "../db/index.ts";
import { users } from "../db/schema.ts";
import { date, iso, isoOrNull } from "./convert.ts";

export interface UserRecord extends PublicUser {
  passwordHash: string;
  tokenVersion: number;
  lockedUntil: string | null;
}

type Row = typeof users.$inferSelect;

function toRecord(r: Row): UserRecord {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    phone: r.phone,
    pixKey: r.pixKey,
    createdAt: iso(r.createdAt),
    passwordHash: r.passwordHash,
    tokenVersion: r.tokenVersion,
    lockedUntil: isoOrNull(r.lockedUntil),
  };
}

export function toPublicUser(u: UserRecord): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    phone: u.phone,
    pixKey: u.pixKey,
    createdAt: u.createdAt,
  };
}

/** Postgres unique_violation on users.email, whichever driver raised it (Drizzle wraps the cause). */
export function isDuplicateEmail(err: unknown): boolean {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    const pg = e as Error & { code?: unknown; constraint?: unknown };
    const where = typeof pg.constraint === "string" ? pg.constraint : pg.message;
    if (pg.code === "23505" && where.includes("users_email")) return true;
  }
  return false;
}

export function usersRepo(db: Executor) {
  return {
    async findById(id: string): Promise<UserRecord | undefined> {
      const [r] = await db.select().from(users).where(eq(users.id, id));
      return r && toRecord(r);
    },

    async findByEmail(email: string): Promise<UserRecord | undefined> {
      const [r] = await db.select().from(users).where(eq(users.email, email));
      return r && toRecord(r);
    },

    async insert(u: {
      id: string;
      email: string;
      name: string;
      role: Role;
      passwordHash: string;
      createdAt: string;
    }): Promise<void> {
      await db.insert(users).values({ ...u, createdAt: date(u.createdAt) });
    },

    async updateProfile(
      id: string,
      p: { name: string; phone: string | null; pixKey: string | null },
    ): Promise<void> {
      await db.update(users).set(p).where(eq(users.id, id));
    },

    /** Also bumps the token version (kills access tokens) and clears any lockout. */
    async setPassword(id: string, passwordHash: string): Promise<void> {
      await db
        .update(users)
        .set({
          passwordHash,
          tokenVersion: sql`${users.tokenVersion} + 1`,
          failedLogins: 0,
          lockedUntil: null,
        })
        .where(eq(users.id, id));
    },

    async bumpTokenVersion(id: string): Promise<void> {
      await db
        .update(users)
        .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
        .where(eq(users.id, id));
    },

    /** Counts a failed login atomically; returns the lock expiry when this failure reached the threshold. */
    async recordLoginFailure(
      id: string,
      threshold: number,
      lockUntil: string,
    ): Promise<string | null> {
      const reached = sql`${users.failedLogins} + 1 >= ${threshold}`;
      const [row] = await db
        .update(users)
        .set({
          failedLogins: sql`CASE WHEN ${reached} THEN 0 ELSE ${users.failedLogins} + 1 END`,
          lockedUntil: sql`CASE WHEN ${reached} THEN ${lockUntil}::timestamptz ELSE ${users.lockedUntil} END`,
        })
        .where(eq(users.id, id))
        .returning({ lockedUntil: users.lockedUntil });
      const locked = row ? isoOrNull(row.lockedUntil) : null;
      return locked === lockUntil ? lockUntil : null;
    },

    async clearLoginFailures(id: string): Promise<void> {
      await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, id));
    },

    /** Keeps the row (history points at it) but removes everything that identifies the person. */
    async anonymize(id: string, placeholderEmail: string): Promise<void> {
      await db
        .update(users)
        .set({
          email: placeholderEmail,
          name: "Conta excluída",
          phone: null,
          pixKey: null,
          passwordHash: "!",
          tokenVersion: sql`${users.tokenVersion} + 1`,
          failedLogins: 0,
          lockedUntil: null,
        })
        .where(eq(users.id, id));
    },
  };
}
