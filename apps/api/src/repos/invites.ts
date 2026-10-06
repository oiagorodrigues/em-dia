import { and, eq, gt } from "drizzle-orm";
import type { Executor } from "../db/index.ts";
import { invites } from "../db/schema.ts";
import { date } from "./convert.ts";

export function invitesRepo(db: Executor) {
  return {
    /** One live code per contract: regenerating replaces the previous one. */
    async upsert(
      contractId: string,
      codeHash: string,
      expiresAt: string,
      createdAt: string,
    ): Promise<void> {
      const values = { codeHash, expiresAt: date(expiresAt), createdAt: date(createdAt) };
      await db
        .insert(invites)
        .values({ contractId, ...values })
        .onConflictDoUpdate({ target: invites.contractId, set: values });
    },

    async findContractId(codeHash: string, now: string): Promise<string | undefined> {
      const [row] = await db
        .select({ contractId: invites.contractId })
        .from(invites)
        .where(and(eq(invites.codeHash, codeHash), gt(invites.expiresAt, date(now))));
      return row?.contractId;
    },

    async deleteForContract(contractId: string): Promise<void> {
      await db.delete(invites).where(eq(invites.contractId, contractId));
    },
  };
}
