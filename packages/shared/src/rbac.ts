import type { Role } from "./domain.ts";

export const PERMISSIONS = [
  "household:manage",
  "contract:create",
  "contract:update",
  "contract:invite",
  "contract:join",
  "contract:read",
  "entry:write",
  "entry:confirm",
  "entry:clock",
  "adjustment:write",
  "payment:write",
  "payment:acknowledge",
  "agreement:write",
  "agreement:accept",
  "account:delete",
  "receipt:read",
  "activity:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Role grants are coarse. Resource ownership (is this my household? is this my
 * contract?) is checked separately by the API on every request.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  employer: [
    "household:manage",
    "contract:create",
    "contract:update",
    "contract:invite",
    "contract:read",
    "entry:write",
    "entry:confirm",
    "entry:clock",
    "adjustment:write",
    "payment:write",
    "agreement:write",
    "account:delete",
    "receipt:read",
    "activity:read",
  ],
  worker: [
    "contract:join",
    "contract:read",
    "entry:write",
    "entry:confirm",
    "entry:clock",
    "payment:acknowledge",
    "agreement:accept",
    "account:delete",
    "receipt:read",
    "activity:read",
  ],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
