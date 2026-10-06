import type { ActivityItem } from "@emdia/shared";
import { desc, eq } from "drizzle-orm";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import type { Executor } from "../db/index.ts";
import { auditLog, users } from "../db/schema.ts";
import { date, iso } from "./convert.ts";

export interface AuditEvent {
  id: string;
  actorId: string | null;
  contractId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  meta: Record<string, unknown> | null;
  at: string;
}

/** `meta` is jsonb, typed by declaration only; the read path checks it is an object. */
const metaColumn = createSelectSchema(auditLog, {
  meta: z.record(z.string(), z.unknown()).nullable(),
}).shape.meta;

export function auditRepo(db: Executor) {
  return {
    async insert(e: AuditEvent): Promise<void> {
      await db.insert(auditLog).values({ ...e, at: date(e.at) });
    },

    async listByContract(contractId: string, limit: number): Promise<ActivityItem[]> {
      const rows = await db
        .select({
          id: auditLog.id,
          actorId: auditLog.actorId,
          actorName: users.name,
          action: auditLog.action,
          entity: auditLog.entity,
          entityId: auditLog.entityId,
          meta: auditLog.meta,
          at: auditLog.at,
        })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.actorId))
        .where(eq(auditLog.contractId, contractId))
        .orderBy(desc(auditLog.at), desc(auditLog.seq))
        .limit(limit);
      return rows.map((r) => ({ ...r, meta: metaColumn.parse(r.meta), at: iso(r.at) }));
    },
  };
}
