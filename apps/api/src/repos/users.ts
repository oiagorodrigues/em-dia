import type { PublicUser, Role } from "@emdia/shared";
import type { Executor } from "../db/index.ts";

export interface UserRecord extends PublicUser {
  passwordHash: string;
  tokenVersion: number;
  lockedUntil: string | null;
}

interface Row {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone: string | null;
  pix_key: string | null;
  password_hash: string;
  token_version: number;
  failed_logins: number;
  locked_until: string | null;
  created_at: string;
}

function toRecord(r: Row): UserRecord {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    phone: r.phone,
    pixKey: r.pix_key,
    createdAt: r.created_at,
    passwordHash: r.password_hash,
    tokenVersion: r.token_version,
    lockedUntil: r.locked_until,
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

export function usersRepo(db: Executor) {
  return {
    async findById(id: string): Promise<UserRecord | undefined> {
      const r = await db.get<Row>("SELECT * FROM users WHERE id = ?", id);
      return r && toRecord(r);
    },

    async findByEmail(email: string): Promise<UserRecord | undefined> {
      const r = await db.get<Row>("SELECT * FROM users WHERE email = ?", email);
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
      await db.run(
        "INSERT INTO users (id, email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        u.id,
        u.email,
        u.name,
        u.role,
        u.passwordHash,
        u.createdAt,
      );
    },

    async updateProfile(
      id: string,
      p: { name: string; phone: string | null; pixKey: string | null },
    ): Promise<void> {
      await db.run(
        "UPDATE users SET name = ?, phone = ?, pix_key = ? WHERE id = ?",
        p.name,
        p.phone,
        p.pixKey,
        id,
      );
    },

    /** Also bumps the token version (kills access tokens) and clears any lockout. */
    async setPassword(id: string, passwordHash: string): Promise<void> {
      await db.run(
        `UPDATE users SET password_hash = ?, token_version = token_version + 1, failed_logins = 0, locked_until = NULL
         WHERE id = ?`,
        passwordHash,
        id,
      );
    },

    async bumpTokenVersion(id: string): Promise<void> {
      await db.run("UPDATE users SET token_version = token_version + 1 WHERE id = ?", id);
    },

    /** Counts a failed login atomically; returns the lock expiry when this failure reached the threshold. */
    async recordLoginFailure(
      id: string,
      threshold: number,
      lockUntil: string,
    ): Promise<string | null> {
      const row = await db.get<{ locked_until: string | null }>(
        `UPDATE users SET
           failed_logins = CASE WHEN failed_logins + 1 >= ? THEN 0 ELSE failed_logins + 1 END,
           locked_until = CASE WHEN failed_logins + 1 >= ? THEN ? ELSE locked_until END
         WHERE id = ? RETURNING locked_until`,
        threshold,
        threshold,
        lockUntil,
        id,
      );
      return row?.locked_until === lockUntil ? lockUntil : null;
    },

    async clearLoginFailures(id: string): Promise<void> {
      await db.run("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?", id);
    },

    /** Keeps the row (history points at it) but removes everything that identifies the person. */
    async anonymize(id: string, placeholderEmail: string): Promise<void> {
      await db.run(
        `UPDATE users SET email = ?, name = 'Conta excluída', phone = NULL, pix_key = NULL, password_hash = '!',
           token_version = token_version + 1, failed_logins = 0, locked_until = NULL
         WHERE id = ?`,
        placeholderEmail,
        id,
      );
    },
  };
}
