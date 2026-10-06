import type { PublicUser, UpdateMeInput } from "@emdia/shared";
import { notFound } from "../lib/errors.ts";
import { toPublicUser } from "../repos/index.ts";
import type { Actor, ServiceDeps } from "./context.ts";

export function meService(deps: ServiceDeps) {
  return {
    async update(actor: Actor, input: UpdateMeInput): Promise<PublicUser> {
      await deps.repos.users.updateProfile(actor.id, {
        name: input.name ?? actor.name,
        phone: input.phone === undefined ? actor.phone : input.phone || null,
        pixKey: input.pixKey === undefined ? actor.pixKey : input.pixKey || null,
      });
      const user = await deps.repos.users.findById(actor.id);
      if (!user) throw notFound();
      return toPublicUser(user);
    },
  };
}
