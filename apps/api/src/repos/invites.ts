import type { Executor } from "../db/index.ts";

export function invitesRepo(db: Executor) {
  return {
    /** One live code per contract: regenerating replaces the previous one. */
    async upsert(
      contractId: string,
      codeHash: string,
      expiresAt: string,
      createdAt: string,
    ): Promise<void> {
      await db.run(
        `INSERT INTO invites (contract_id, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (contract_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,
           created_at = excluded.created_at`,
        contractId,
        codeHash,
        expiresAt,
        createdAt,
      );
    },

    async findContractId(codeHash: string, now: string): Promise<string | undefined> {
      const row = await db.get<{ contract_id: string }>(
        "SELECT contract_id FROM invites WHERE code_hash = ? AND expires_at > ?",
        codeHash,
        now,
      );
      return row?.contract_id;
    },

    async deleteForContract(contractId: string): Promise<void> {
      await db.run("DELETE FROM invites WHERE contract_id = ?", contractId);
    },
  };
}
