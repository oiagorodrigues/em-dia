import {
  formatCents,
  formatDuration,
  type Contract,
  type MonthEstimate,
  type PayType,
} from "@emdia/shared";
import type { Tone } from "./tone.ts";

/** Ended or removed contracts are history: the API answers 409 to any write. */
export function isWritable(contract: Pick<Contract, "status" | "archivedAt">): boolean {
  return contract.status === "active" && !contract.archivedAt;
}

export type ContractState = "active" | "pending" | "ended" | "archived";

export interface ContractStatusView {
  state: ContractState;
  label: string;
  tone: Tone;
}

/** Removal wins over ending, and a missing worker only matters while the contract runs. */
export function contractStatus(
  contract: Pick<Contract, "status" | "archivedAt" | "workerId">,
): ContractStatusView {
  if (contract.archivedAt) return { state: "archived", label: "removido", tone: "coral" };
  if (contract.status === "ended") return { state: "ended", label: "encerrado", tone: "neutral" };
  if (!contract.workerId) return { state: "pending", label: "convite pendente", tone: "amber" };
  return { state: "active", label: "ativo", tone: "brand" };
}

export interface ContactChannels {
  phone: string | null;
  email: string | null;
  pixKey: string | null;
}

/**
 * Before the worker joins, only what the employer typed is known. After, the worker's own
 * profile is the source of truth; the typed phone stays as a fallback.
 */
export function contactChannels(
  contract: Pick<
    Contract,
    "workerId" | "contactEmail" | "contactPhone" | "workerPhone" | "workerPixKey"
  >,
): ContactChannels {
  if (!contract.workerId)
    return { phone: contract.contactPhone, email: contract.contactEmail, pixKey: null };
  return {
    phone: contract.workerPhone ?? contract.contactPhone,
    email: null,
    pixKey: contract.workerPixKey,
  };
}

const UNIT: Record<PayType, [string, string]> = {
  daily: ["diária", "diárias"],
  hourly: ["dia", "dias"],
  monthly: ["dia", "dias"],
};

/** "9 diárias × R$ 180,00", "9 dias × 8h × R$ 25,00", "salário fixo"; null when not priced. */
export function describeEstimate(
  estimate: MonthEstimate,
  contract: Pick<Contract, "payType" | "rateCents" | "schedule">,
): string | null {
  if (estimate.cents === null) return null;
  if (contract.payType === "monthly") return "salário fixo";
  const [one, many] =
    contract.schedule.kind === "per_month" ? ["visita", "visitas"] : UNIT[contract.payType];
  const days = `${estimate.days} ${estimate.days === 1 ? one : many}`;
  const rate = formatCents(contract.rateCents);
  if (contract.payType === "hourly" && estimate.minutesPerDay !== null)
    return `${days} × ${formatDuration(estimate.minutesPerDay)} × ${rate}`;
  return `${days} × ${rate}`;
}

/** Why a contract can't be priced, in the words the form uses. */
export function estimateGap(contract: Pick<Contract, "payType" | "schedule">): string {
  if (contract.schedule.kind === "on_demand") return "sob demanda: sem dias previstos";
  if (contract.payType === "hourly") return "informe os horários para estimar";
  return "sem estimativa";
}
