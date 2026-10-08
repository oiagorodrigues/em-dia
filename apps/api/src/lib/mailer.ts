import { createTransport } from "nodemailer";
import type { Logger } from "./logger.ts";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** Where a reply goes, when it isn't the sender (feedback is answered to the user). */
  replyTo?: string;
}

export interface SentMail extends MailMessage {
  sentAt: string;
}

export interface Mailer {
  /**
   * Resolves true when the message reached a transport (SMTP, or the dev outbox)
   * and false when it was dropped for lack of one. Rejects on transport errors.
   */
  send(message: MailMessage): Promise<boolean>;
  /** Messages kept outside production; exposed through GET /api/v1/dev/outbox. */
  outbox(): readonly SentMail[];
}

export interface MailerOptions {
  isProduction: boolean;
  /** smtp:// or smtps:// with credentials; null disables real delivery. */
  smtpUrl: string | null;
  from: string;
}

const OUTBOX_LIMIT = 50;

export function createMailer(
  { isProduction, smtpUrl, from }: MailerOptions,
  logger: Logger,
): Mailer {
  const transport = smtpUrl ? createTransport(smtpUrl) : null;
  const outbox: SentMail[] | null = isProduction ? null : [];
  return {
    async send(message) {
      if (outbox) {
        outbox.unshift({ ...message, sentAt: new Date().toISOString() });
        outbox.length = Math.min(outbox.length, OUTBOX_LIMIT);
        logger.info("dev mail", { to: message.to, subject: message.subject, body: message.text });
      }
      if (transport) {
        await transport.sendMail({ from, ...message });
        return true;
      }
      if (outbox) return true;
      logger.warn("mail transport not configured, message dropped", { subject: message.subject });
      return false;
    },
    outbox: () => outbox ?? [],
  };
}
