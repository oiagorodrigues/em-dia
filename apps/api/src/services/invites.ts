import type { InviteDelivery } from "@emdia/shared";
import { nowInZone } from "@emdia/shared";
import { randomCode, sha256 } from "../lib/crypto.ts";
import { AppError, notFound } from "../lib/errors.ts";
import type { MailMessage } from "../lib/mailer.ts";
import type { LocatedContract } from "../repos/index.ts";
import { assertNotArchived } from "./access.ts";
import { audit, nowIso, type Actor, type ServiceDeps } from "./context.ts";

export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_LENGTH = 8;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const hashInviteCode = (code: string) => sha256(code.toUpperCase());

/** The contract a code points to, if the code is live and the contract can still be joined. */
export function resolveInvite(deps: ServiceDeps, code: string): LocatedContract | undefined {
  const contractId = deps.repos.invites.findContractId(hashInviteCode(code), nowIso(deps));
  const located = contractId ? deps.repos.contracts.findById(contractId) : undefined;
  const { contract } = located ?? {};
  if (
    !contract ||
    contract.workerId !== null ||
    contract.status !== "active" ||
    contract.archivedAt
  ) {
    return undefined;
  }
  return located;
}

/** Must run inside the caller's transaction. Codes are single use. */
export function linkWorkerByCode(deps: ServiceDeps, workerId: string, code: string): string {
  const located = resolveInvite(deps, code);
  if (!located) throw notFound("Código de convite inválido ou expirado");
  const contractId = located.contract.id;
  deps.repos.contracts.linkWorker(contractId, workerId);
  deps.repos.invites.deleteForContract(contractId);
  audit(deps, {
    actorId: workerId,
    contractId,
    action: "contract.join",
    entity: "contract",
    entityId: contractId,
  });
  return contractId;
}

/** wa.me wants the full international number; Brazilian numbers are stored with or without 55. */
export function whatsappUrl(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, "");
  const hasCountryCode = digits.startsWith("55") && (digits.length === 12 || digits.length === 13);
  return `https://wa.me/${hasCountryCode ? digits : `55${digits}`}?text=${encodeURIComponent(text)}`;
}

interface InviteText {
  workerName: string;
  employerName: string;
  householdName: string;
  code: string;
  signupUrl: string;
  validUntil: string;
}

function whatsappText(t: InviteText): string {
  return (
    `Oi, ${t.workerName}! Aqui é ${t.employerName}. Cadastrei você no em dia (${t.householdName}) ` +
    `para a gente anotar junto os dias de trabalho e os pagamentos. ` +
    `Crie sua conta por este link: ${t.signupUrl} (código ${t.code})`
  );
}

function inviteEmail(to: string, t: InviteText): MailMessage {
  return {
    to,
    subject: `${t.employerName} convidou você para o em dia`,
    text: [
      `Olá, ${t.workerName}!`,
      "",
      `${t.employerName} cadastrou você em ${t.householdName} no em dia, o app onde vocês dois anotam os dias de trabalho, as horas e os pagamentos. Tudo fica registrado e cada um confirma o que o outro lançou.`,
      "",
      "Para criar sua conta, abra este link:",
      t.signupUrl,
      "",
      `Se preferir, use o código ${t.code} na tela de cadastro. Ele vale até ${t.validUntil}.`,
      "",
      `Qualquer dúvida, é só falar com ${t.employerName}.`,
      "",
      "em dia",
    ].join("\n"),
  };
}

/**
 * Replaces any previous code, e-mails it when the contract has a contact e-mail
 * and returns everything the employer needs to share it by hand.
 */
export async function issueInvite(
  deps: ServiceDeps,
  actor: Actor,
  { contract, timezone }: LocatedContract,
): Promise<InviteDelivery> {
  assertNotArchived(contract);
  if (contract.workerId) {
    throw new AppError("CONFLICT", "Este vínculo já tem uma profissional conectada");
  }
  if (contract.status === "ended") throw new AppError("CONFLICT", "Este vínculo está encerrado");

  const code = randomCode(INVITE_ALPHABET, INVITE_LENGTH);
  const expiresAt = new Date(deps.clock().getTime() + INVITE_TTL_MS).toISOString();
  deps.repos.invites.upsert(contract.id, hashInviteCode(code), expiresAt, nowIso(deps));

  const signupUrl = `${deps.config.webOrigin}/criar-conta?convite=${code}`;
  const text: InviteText = {
    workerName: contract.workerName,
    employerName: contract.employerName,
    householdName: contract.householdName,
    code,
    signupUrl,
    validUntil: nowInZone(timezone, new Date(expiresAt)).date.split("-").reverse().join("/"),
  };

  let emailSent = false;
  if (contract.contactEmail) {
    try {
      emailSent = await deps.mailer.send(inviteEmail(contract.contactEmail, text));
    } catch (err) {
      deps.logger.error("failed to send invite mail", { err, contractId: contract.id });
    }
  }
  audit(deps, {
    actorId: actor.id,
    contractId: contract.id,
    action: "contract.invite_sent",
    entity: "contract",
    entityId: contract.id,
    meta: { email: emailSent },
  });

  const phone = contract.contactPhone ?? contract.workerPhone;
  return {
    code,
    expiresAt,
    signupUrl,
    emailSent,
    whatsappUrl: phone ? whatsappUrl(phone, whatsappText(text)) : null,
  };
}
