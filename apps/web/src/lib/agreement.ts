import type { Agreement } from "@emdia/shared";
import type { Tone } from "./tone.ts";

export type AgreementState = "pending" | "running" | "settled" | "cancelled";

export interface AgreementStatus {
  state: AgreementState;
  label: string;
  tone: Tone;
}

/** Cancelled wins; a fully paid agreement is settled even if the worker never tapped "concordo". */
export function agreementStatus(
  a: Pick<Agreement, "cancelledAt" | "acceptedAt" | "remainingCents">,
): AgreementStatus {
  if (a.cancelledAt) return { state: "cancelled", label: "Cancelado", tone: "neutral" };
  if (a.remainingCents <= 0) return { state: "settled", label: "Quitado", tone: "brand" };
  if (!a.acceptedAt)
    return {
      state: "pending",
      label: "Aguardando a profissional concordar",
      tone: "amber",
    };
  return { state: "running", label: "Em andamento", tone: "brand" };
}

/** Share already paid back, 0–100. */
export function agreementProgress(a: Pick<Agreement, "totalCents" | "settledCents">): number {
  if (a.totalCents <= 0) return 0;
  return Math.min(100, Math.round((a.settledCents / a.totalCents) * 100));
}

/** What the next installment would be: the suggested amount, capped at what is left. */
export function nextInstallmentCents(
  a: Pick<Agreement, "installmentCents" | "remainingCents">,
): number {
  return a.installmentCents === null
    ? a.remainingCents
    : Math.min(a.installmentCents, a.remainingCents);
}

/** Agreements that can still receive a compensation payment. */
export function isOpenAgreement(a: Pick<Agreement, "cancelledAt" | "remainingCents">): boolean {
  return !a.cancelledAt && a.remainingCents > 0;
}
