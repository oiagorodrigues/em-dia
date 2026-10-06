import { execute, queryOne, type Db } from "../db/index.ts";

export function invitesRepo(db: Db) {
  return {
    /** One live code per contract: regenerating replaces the previous one. */
    upsert(contractId: string, codeHash: string, expiresAt: string, createdAt: string): void {
      execute(
        db,
        `INSERT INTO invites (contract_id, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (contract_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,
           created_at = excluded.created_at`,
        contractId,
        codeHash,
        expiresAt,
        createdAt,
      );
    },

    findContractId(codeHash: string, now: string): string | undefined {
      return queryOne<{ contract_id: string }>(
        db,
        "SELECT contract_id FROM invites WHERE code_hash = ? AND expires_at > ?",
        codeHash,
        now,
      )?.contract_id;
    },

    deleteForContract(contractId: string): void {
      execute(db, "DELETE FROM invites WHERE contract_id = ?", contractId);
    },
  };
}
