import { computed, ref } from "vue";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const HINT_KEY = "ponto:install-hint-seen";

const deferred = ref<BeforeInstallPromptEvent | null>(null);
const installed = ref(false);
const hintSeen = ref(false);

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

/** Must run before the app mounts: browsers fire `beforeinstallprompt` once, early. */
export function initInstallPrompt(): void {
  installed.value = isStandalone();
  try {
    hintSeen.value = localStorage.getItem(HINT_KEY) === "1";
  } catch {
    hintSeen.value = false;
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred.value = e as BeforeInstallPromptEvent;
  });
  window.addEventListener("appinstalled", () => {
    installed.value = true;
    deferred.value = null;
  });
}

export function useInstallPrompt() {
  const canPrompt = computed(() => !installed.value && deferred.value !== null);
  const showIosHelp = computed(() => !installed.value && deferred.value === null && isIos());
  const available = computed(() => canPrompt.value || showIosHelp.value);
  const showHint = computed(() => available.value && !hintSeen.value);

  async function install(): Promise<boolean> {
    const ev = deferred.value;
    if (!ev) return false;
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    deferred.value = null;
    if (outcome === "accepted") installed.value = true;
    return outcome === "accepted";
  }

  function dismissHint(): void {
    hintSeen.value = true;
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  return { canPrompt, showIosHelp, available, showHint, install, dismissHint, installed };
}
