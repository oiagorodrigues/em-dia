import {
  ENTRY_STATUS_LABEL,
  formatCents,
  formatYearMonth,
  type ActivityItem,
  type EntryStatus,
  type PaymentKind,
} from "@emdia/shared";
import { formatDayMonth } from "./format.ts";

const KIND_NOUN: Record<Exclude<PaymentKind, "pay">, string> = {
  bonus: "uma gratificação",
  transport: "vale-transporte",
  advance: "um adiantamento",
  deduction: "um desconto",
};

/** History written before adjustments became payment kinds keeps reading as it did. */
const LEGACY_ADJUSTMENT: Record<string, string> = {
  bonus: "uma gratificação",
  transport: "vale-transporte",
  advance: "um adiantamento (vale)",
  deduction: "um desconto",
};

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

function agreementName(meta: ActivityItem["meta"]): string {
  const d = str(meta, "description");
  return d ? ` “${d}”` : "";
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
      const label = LEGACY_ADJUSTMENT[str(m, "kind") ?? ""] ?? "um lançamento";
      return { actor, text: `lançou ${label}${ref}`, value: money, tone: "money" };
    }
    case "adjustment.delete": {
      const label = LEGACY_ADJUSTMENT[str(m, "kind") ?? ""] ?? "um lançamento";
      return { actor, text: `removeu ${label}${ref}`, value: money, tone: "neutral" };
    }
    case "payment.create": {
      if (str(m, "advanceId"))
        return { actor, text: `abateu do adiantamento${ref}`, value: money, tone: "money" };
      const kind = str(m, "kind") as PaymentKind | null;
      const what = kind && kind !== "pay" ? KIND_NOUN[kind] : "um pagamento";
      const verb = kind === "deduction" ? "lançou" : "registrou";
      return { actor, text: `${verb} ${what}${ref}`, value: money, tone: "money" };
    }
    case "payment.update":
      return { actor, text: `editou um lançamento${ref}`, value: money, tone: "neutral" };
    case "payment.delete": {
      const kind = str(m, "kind") as PaymentKind | null;
      const what = kind && kind !== "pay" ? KIND_NOUN[kind] : "um pagamento";
      return { actor, text: `excluiu ${what}${ref}`, value: money, tone: "alert" };
    }
    case "payment.receipt":
      return { actor, text: "anexou um comprovante", tone: "neutral" };
    case "payment.acknowledge":
      return { actor, text: "confirmou que recebeu um pagamento", tone: "ok" };
    case "payment.confirm":
      return { actor, text: "marcou um pagamento como concluído", tone: "ok" };
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
    case "contract.worker_left":
      return { actor, text: "excluiu a conta e saiu do vínculo", tone: "alert" };
    case "agreement.create": {
      const total = num(m, "totalCents");
      return {
        actor,
        text: `propôs o acordo${agreementName(m)}`,
        value: total !== null ? formatCents(total) : undefined,
        tone: "money",
      };
    }
    case "agreement.accept":
      return { actor, text: `concordou com o acordo${agreementName(m)}`, tone: "ok" };
    case "agreement.cancel":
      return { actor, text: `cancelou o acordo${agreementName(m)}`, tone: "alert" };
    case "agreement.archive":
      return { actor, text: `removeu o acordo${agreementName(m)}`, tone: "alert" };
    case "agreement.restore":
      return { actor, text: `restaurou o acordo${agreementName(m)}`, tone: "ok" };
    default:
      return { actor, text: "fez uma alteração", tone: "neutral" };
  }
}

export type ActivityGroup = "registros" | "pagamentos" | "vinculo";

/** History filter buckets: days, money (payments of every kind, agreements), and the contract itself. */
export function activityGroup(action: string): ActivityGroup {
  if (action.startsWith("entry.")) return "registros";
  if (
    action.startsWith("payment.") ||
    action.startsWith("adjustment.") ||
    action.startsWith("agreement.")
  )
    return "pagamentos";
  return "vinculo";
}
