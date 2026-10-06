/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vue" />

import type { Role } from "@emdia/shared";

declare module "vue-router" {
  interface RouteMeta {
    public?: true;
    /** Public pages a signed-in person shouldn't see (login, signup). */
    guestOnly?: true;
    roles?: Role[];
    layout?: "app" | "auth" | "bare";
    title?: string;
  }
}
