import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/martian-mono/standard.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/tailwind.css";

import { PiniaColada } from "@pinia/colada";
import { createPinia } from "pinia";
import { createApp } from "vue";
import { z } from "zod";
import { configureAuthHooks } from "@/api/client.ts";
import { queryCacheOptions } from "@/api/query.ts";
import { initInstallPrompt } from "@/composables/install.ts";
import { initTheme } from "@/composables/theme.ts";
import { createAppRouter } from "@/router/index.ts";
import { safeNext } from "@/router/guard.ts";
import { useAuthStore } from "@/stores/auth.ts";
import App from "./App.vue";

// zod probes for eval support with new Function(), which the production CSP reports as a violation.
z.config({ jitless: true });
initTheme();
initInstallPrompt();

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(PiniaColada, queryCacheOptions());
const router = createAppRouter();
app.use(router);

const auth = useAuthStore(pinia);
configureAuthHooks({
  onSession: (session) => auth.setUser(session.user),
  onSessionLost: () => {
    if (!auth.user) return;
    auth.clear();
    const current = router.currentRoute.value;
    if (!current.meta.public) {
      const next = safeNext(current.fullPath);
      void router.replace({ path: "/entrar", query: next && next !== "/" ? { next } : {} });
    }
  },
});

void router.isReady().then(() => app.mount("#app"));
