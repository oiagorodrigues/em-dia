import type { ActivityItem } from "@emdia/shared";
import type { Executor } from "../db/index.ts";

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

interface Row {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  meta: string | null;
  at: string;
}

export function auditRepo(db: Executor) {
  return {
    async insert(e: AuditEvent): Promise<void> {
      await db.run(
        `INSERT INTO audit_log (id, actor_id, contract_id, action, entity, entity_id, meta, at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        e.id,
        e.actorId,
        e.contractId,
        e.action,
        e.entity,
        e.entityId,
        e.meta === null ? null : JSON.stringify(e.meta),
        e.at,
      );
    },

    async listByContract(contractId: string, limit: number): Promise<ActivityItem[]> {
      return (
        await db.all<Row>(
          `SELECT a.*, u.name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
         WHERE a.contract_id = ? ORDER BY a.at DESC, a.rowid DESC LIMIT ?`,
          contractId,
          limit,
        )
      ).map((r) => ({
        id: r.id,
        actorId: r.actor_id,
        actorName: r.actor_name,
        action: r.action,
        entity: r.entity,
        entityId: r.entity_id,
        meta: r.meta === null ? null : (JSON.parse(r.meta) as Record<string, unknown>),
        at: r.at,
      }));
    },
  };
}
