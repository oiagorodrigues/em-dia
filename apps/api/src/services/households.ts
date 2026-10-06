import type { Household } from "@emdia/shared";
import { DEFAULT_TIMEZONE } from "@emdia/shared";
import { fieldError, notFound } from "../lib/errors.ts";
import { newId } from "../lib/ids.ts";
import { nowIso, requirePermission, type Actor, type ServiceDeps } from "./context.ts";

interface HouseholdInput {
  name: string;
  timezone?: string | undefined;
}

function checkTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return timezone;
  } catch {
    throw fieldError("timezone", "Fuso horário inválido");
  }
}

export function householdsService(deps: ServiceDeps) {
  const { households } = deps.repos;
  return {
    list(actor: Actor): Household[] {
      requirePermission(actor, "household:manage");
      return households.listByOwner(actor.id);
    },

    create(actor: Actor, input: HouseholdInput): Household {
      requirePermission(actor, "household:manage");
      const household: Household = {
        id: newId(),
        ownerId: actor.id,
        name: input.name,
        timezone: checkTimezone(input.timezone ?? DEFAULT_TIMEZONE),
        createdAt: nowIso(deps),
      };
      households.insert(household);
      return household;
    },

    update(actor: Actor, id: string, input: HouseholdInput): Household {
      requirePermission(actor, "household:manage");
      const current = households.findById(id);
      if (!current || current.ownerId !== actor.id) throw notFound("Casa não encontrada");
      const next = {
        name: input.name,
        timezone: checkTimezone(input.timezone ?? current.timezone),
      };
      households.update(id, next);
      return { ...current, ...next };
    },
  };
}
