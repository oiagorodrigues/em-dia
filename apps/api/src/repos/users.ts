import type { PublicUser, Role } from "@ponto/shared";
import { execute, queryOne, type Db } from "../db/index.ts";

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

export function usersRepo(db: Db) {
  return {
    findById(id: string): UserRecord | undefined {
      const r = queryOne<Row>(db, "SELECT * FROM users WHERE id = ?", id);
      return r && toRecord(r);
    },

    findByEmail(email: string): UserRecord | undefined {
      const r = queryOne<Row>(db, "SELECT * FROM users WHERE email = ?", email);
      return r && toRecord(r);
    },

    insert(u: {
      id: string;
      email: string;
      name: string;
      role: Role;
      passwordHash: string;
      createdAt: string;
    }): void {
      execute(
        db,
        "INSERT INTO users (id, email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        u.id,
        u.email,
        u.name,
        u.role,
        u.passwordHash,
        u.createdAt,
      );
    },

    updateProfile(
      id: string,
      p: { name: string; phone: string | null; pixKey: string | null },
    ): void {
      execute(
        db,
        "UPDATE users SET name = ?, phone = ?, pix_key = ? WHERE id = ?",
        p.name,
        p.phone,
        p.pixKey,
        id,
      );
    },

    /** Also bumps the token version (kills access tokens) and clears any lockout. */
    setPassword(id: string, passwordHash: string): void {
      execute(
        db,
        `UPDATE users SET password_hash = ?, token_version = token_version + 1, failed_logins = 0, locked_until = NULL
         WHERE id = ?`,
        passwordHash,
        id,
      );
    },

    bumpTokenVersion(id: string): void {
      execute(db, "UPDATE users SET token_version = token_version + 1 WHERE id = ?", id);
    },

    /** Counts a failed login atomically; returns the lock expiry when this failure reached the threshold. */
    recordLoginFailure(id: string, threshold: number, lockUntil: string): string | null {
      const row = queryOne<{ locked_until: string | null }>(
        db,
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

    clearLoginFailures(id: string): void {
      execute(db, "UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?", id);
    },

    deleteByEmail(email: string): void {
      execute(db, "DELETE FROM users WHERE email = ?", email);
    },
  };
}
