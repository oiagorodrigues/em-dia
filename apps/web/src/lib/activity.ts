import {
  ADJUSTMENT_KIND_LABEL,
  ENTRY_STATUS_LABEL,
  formatCents,
  formatYearMonth,
  type ActivityItem,
  type AdjustmentKind,
  type EntryStatus,
} from "@emdia/shared";
import { formatDayMonth } from "./format.ts";

export interface ActivityLine {
  actor: string;
  text: string;
  /** Short value set in mono after the sentence: a time, an amount. */
  value?: string;
  tone: "neutral" | "money" | "alert" | "ok";
}

const CONTRACT_FIELDS: Record<string, string> = {
  workerName: "nome",
  occupation: "função",
  payType: "forma de pagamento",
  rateCents: "valor",
  schedule: "frequência",
  deductAbsences: "desconto de faltas",
  contactEmail: "contato",
  contactPhone: "contato",
  expectedStart: "horário",
  expectedEnd: "horário",
  startedOn: "data de início",
};

function str(meta: ActivityItem["meta"], key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" ? v : null;
}

function num(meta: ActivityItem["meta"], key: string): number | null {
  const v = meta?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function day(meta: ActivityItem["meta"]): string {
  const d = str(meta, "date");
  return d ? ` o dia ${formatDayMonth(d)}` : " um dia";
}

/** Turns an audit row into a short pt-BR sentence. Unknown actions get a neutral fallback. */
export function describeActivity(item: ActivityItem, meId: string | null): ActivityLine {
  const actor = item.actorId && item.actorId === meId ? "Você" : (item.actorName ?? "Alguém");
  const m = item.meta;
  const amount = num(m, "amountCents");
  const money = amount !== null ? formatCents(amount) : undefined;
  const refMonth = str(m, "referenceMonth") ?? str(m, "month");
  const ref = refMonth ? ` de ${formatYearMonth(refMonth)}` : "";

  switch (item.action) {
    case "entry.create":
    case "entry.update": {
      const status = str(m, "status") as EntryStatus | null;
      const verb = item.action === "entry.create" ? "anotou" : "alterou";
      const what = status ? ` como “${ENTRY_STATUS_LABEL[status]?.toLowerCase() ?? status}”` : "";
      return {
        actor,
        text: `${verb}${day(m)}${what}`,
        tone: status === "absent" ? "alert" : "neutral",
      };
    }
    case "entry.delete": {
      const d = str(m, "date");
      return {
        actor,
        text: d ? `apagou o registro de ${formatDayMonth(d)}` : "apagou um registro",
        tone: "neutral",
      };
    }
    case "entry.confirm":
      return { actor, text: `confirmou${day(m)}`, tone: "ok" };
    case "entry.clock_in":
      return {
        actor,
        text: "bateu a entrada",
        value: str(m, "time") ?? undefined,
        tone: "neutral",
      };
    case "entry.clock_out":
      return { actor, text: "bateu a saída", value: str(m, "time") ?? undefined, tone: "neutral" };
    case "adjustment.create": {
      const kind = str(m, "kind") as AdjustmentKind | null;
      const label = kind ? (ADJUSTMENT_KIND_LABEL[kind] ?? kind).toLowerCase() : "um lançamento";
      return { actor, text: `lançou ${label}${ref}`, value: money, tone: "money" };
    }
    case "adjustment.delete": {
      const kind = str(m, "kind") as AdjustmentKind | null;
      const label = kind ? (ADJUSTMENT_KIND_LABEL[kind] ?? kind).toLowerCase() : "um lançamento";
      return { actor, text: `removeu ${label}${ref}`, value: money, tone: "neutral" };
    }
    case "payment.create":
      return { actor, text: `registrou um pagamento${ref}`, value: money, tone: "money" };
    case "payment.delete":
      return { actor, text: `excluiu um pagamento${ref}`, value: money, tone: "alert" };
    case "payment.receipt":
      return { actor, text: "anexou um comprovante", tone: "neutral" };
    case "payment.acknowledge":
      return { actor, text: "confirmou que recebeu um pagamento", tone: "ok" };
    case "contract.create":
      return { actor, text: "criou o vínculo", tone: "neutral" };
    case "contract.update": {
      const fields = Array.isArray(m?.fields)
        ? (m.fields as unknown[]).filter((f): f is string => typeof f === "string")
        : [];
      const names = [...new Set(fields.map((f) => CONTRACT_FIELDS[f]).filter(Boolean))];
      return {
        actor,
        text: names.length ? `mudou ${names.join(", ")} do combinado` : "mudou o combinado",
        tone: "neutral",
      };
    }
    case "contract.end": {
      const endedOn = str(m, "endedOn");
      return {
        actor,
        text: endedOn ? `encerrou o vínculo em ${formatDayMonth(endedOn)}` : "encerrou o vínculo",
        tone: "alert",
      };
    }
    case "contract.invite":
    case "contract.invite_sent":
      return {
        actor,
        text: m?.email === true ? "mandou o convite por e-mail" : "gerou um código de convite",
        tone: "neutral",
      };
    case "contract.archive":
      return { actor, text: "removeu o vínculo", tone: "alert" };
    case "contract.restore":
      return { actor, text: "restaurou o vínculo", tone: "ok" };
    case "contract.join":
      return { actor, text: "entrou no vínculo com o código", tone: "ok" };
    default:
      return { actor, text: "fez uma alteração", tone: "neutral" };
  }
}

export type ActivityGroup = "registros" | "pagamentos" | "vinculo";

/** History filter buckets: days, money (payments and extras), and the contract itself. */
export function activityGroup(action: string): ActivityGroup {
  if (action.startsWith("entry.")) return "registros";
  if (action.startsWith("payment.") || action.startsWith("adjustment.")) return "pagamentos";
  return "vinculo";
}
