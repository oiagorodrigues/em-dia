import type { InviteDelivery } from "@emdia/shared";
import { nowInZone } from "@emdia/shared";
import { randomCode, sha256 } from "../lib/crypto.ts";
import { AppError, notFound } from "../lib/errors.ts";
import type { MailMessage } from "../lib/mailer.ts";
import type { LocatedContract, TxRepos } from "../repos/index.ts";
import { assertNotArchived } from "./access.ts";
import { audit, nowIso, type Actor, type ServiceDeps } from "./context.ts";

export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_LENGTH = 8;
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const hashInviteCode = (code: string) => sha256(code.toUpperCase());

/** The contract a code points to, if the code is live and the contract can still be joined. */
export async function resolveInvite(
  deps: ServiceDeps,
  code: string,
  r: TxRepos = deps.repos,
): Promise<LocatedContract | undefined> {
  const contractId = await r.invites.findContractId(hashInviteCode(code), nowIso(deps));
  const located = contractId ? await r.contracts.findById(contractId) : undefined;
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

/** Runs on the caller's transaction (`r`). Codes are single use. */
export async function linkWorkerByCode(
  deps: ServiceDeps,
  r: TxRepos,
  workerId: string,
  code: string,
): Promise<string> {
  const located = await resolveInvite(deps, code, r);
  if (!located) throw notFound("Código de convite inválido ou expirado");
  const contractId = located.contract.id;
  await r.contracts.linkWorker(contractId, workerId);
  await r.invites.deleteForContract(contractId);
  await audit(
    deps,
    {
      actorId: workerId,
      contractId,
      action: "contract.join",
      entity: "contract",
      entityId: contractId,
    },
    r,
  );
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
    `Crie sua conta por este link: ${t.signupUrl} (código ${t.code}). ` +
    `Se você já usa o em dia, é só entrar e colar o código em "Entrar em outro vínculo".`
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
      `Já tem conta no em dia? Abra o mesmo link e toque em "Entrar", ou, já dentro do app, vá em "Entrar em outro vínculo" e cole o código ${t.code}. O vínculo com ${t.employerName} aparece junto dos que você já tem.`,
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
  await deps.repos.invites.upsert(contract.id, hashInviteCode(code), expiresAt, nowIso(deps));

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
  await audit(deps, {
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
