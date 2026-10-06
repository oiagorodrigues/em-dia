import type { Logger } from "./logger.ts";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface SentMail extends MailMessage {
  sentAt: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
  /** Only the dev mailer keeps messages; exposed through GET /api/v1/dev/outbox. */
  outbox(): readonly SentMail[];
}

const OUTBOX_LIMIT = 50;

export function createDevMailer(logger: Logger): Mailer {
  const sent: SentMail[] = [];
  return {
    async send(message) {
      sent.unshift({ ...message, sentAt: new Date().toISOString() });
      sent.length = Math.min(sent.length, OUTBOX_LIMIT);
      logger.info("dev mail", { to: message.to, subject: message.subject, body: message.text });
    },
    outbox: () => sent,
  };
}

/** No transport is configured for production yet; mail is dropped with a warning. */
export function createNullMailer(logger: Logger): Mailer {
  return {
    async send(message) {
      logger.warn("mail transport not configured, message dropped", { subject: message.subject });
    },
    outbox: () => [],
  };
}
