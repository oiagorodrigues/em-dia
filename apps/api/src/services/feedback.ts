import { FEEDBACK_KIND_LABEL, ROLE_LABEL, type FeedbackInput } from "@emdia/shared";
import { AppError } from "../lib/errors.ts";
import type { Actor, ServiceDeps } from "./context.ts";

export function feedbackService(deps: ServiceDeps) {
  return {
    /** Mails the feedback to the team, with the user's e-mail as reply-to so it can be answered. */
    async send(actor: Actor, input: FeedbackInput): Promise<void> {
      const kind = FEEDBACK_KIND_LABEL[input.kind];
      const text = [
        input.message,
        "",
        "—",
        `De: ${actor.name} <${actor.email}> (${ROLE_LABEL[actor.role].toLowerCase()})`,
        `Tipo: ${kind}`,
        `Tela: ${input.page ?? "não informada"}`,
        `Versão: ${deps.config.version}`,
        `Enviado em: ${deps.clock().toISOString()}`,
      ].join("\n");
      let sent = false;
      try {
        sent = await deps.mailer.send({
          to: deps.config.feedbackTo,
          replyTo: actor.email,
          subject: `em dia · ${kind.toLowerCase()} de ${actor.name}`,
          text,
        });
      } catch (err) {
        deps.logger.error("failed to send feedback mail", { err, userId: actor.id });
      }
      if (!sent)
        throw new AppError("INTERNAL", "Não deu para enviar agora. Tente de novo em instantes.");
    },
  };
}
