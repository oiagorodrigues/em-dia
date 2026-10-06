import type { LoginInput, PublicUser, RegisterInput } from "@ponto/shared";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { authApi, meApi, type Session } from "@/api";
import { announceLogout, refreshSession, setAccessToken } from "@/api/client.ts";

export const useAuthStore = defineStore("auth", () => {
  const user = ref<PublicUser | null>(null);
  const restored = ref(false);
  let restoring: Promise<void> | null = null;

  const role = computed(() => user.value?.role ?? null);
  const isEmployer = computed(() => role.value === "employer");
  const isWorker = computed(() => role.value === "worker");

  function applySession(session: Session): void {
    setAccessToken(session.accessToken);
    user.value = session.user;
  }

  function clear(): void {
    setAccessToken(null);
    user.value = null;
  }

  /** Called once on first navigation: the refresh cookie is the only thing that survives a reload. */
  function restore(): Promise<void> {
    if (restored.value) return Promise.resolve();
    restoring ??= refreshSession()
      .then((session) => {
        if (session) applySession(session);
      })
      .finally(() => {
        restored.value = true;
        restoring = null;
      });
    return restoring;
  }

  async function login(input: LoginInput): Promise<void> {
    applySession(await authApi.login(input));
    restored.value = true;
  }

  async function register(input: RegisterInput): Promise<void> {
    applySession(await authApi.register(input));
    restored.value = true;
  }

  async function logout(): Promise<void> {
    try {
      await authApi.logout();
    } finally {
      announceLogout();
      clear();
    }
  }

  async function logoutAll(): Promise<void> {
    await authApi.logoutAll();
    announceLogout();
    clear();
  }

  async function reloadMe(): Promise<void> {
    user.value = (await meApi.get()).user;
  }

  function setUser(next: PublicUser): void {
    user.value = next;
  }

  return {
    user,
    role,
    isEmployer,
    isWorker,
    restored,
    restore,
    applySession,
    clear,
    login,
    register,
    logout,
    logoutAll,
    reloadMe,
    setUser,
  };
});
