import { ref, watch } from "vue";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "emdia:theme";
/** index.html ships one theme-color per OS scheme; remember them so "sistema" can restore them. */
const originalMetaColor = new WeakMap<HTMLMetaElement, string>();

function readStored(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const mode = ref<ThemeMode>("system");

function apply(next: ThemeMode): void {
  const root = document.documentElement;
  if (next === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", next);
  // The media-scoped theme-color metas only follow the OS; a manual override must win.
  const paper = getComputedStyle(root).getPropertyValue("--paper").trim();
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    if (!originalMetaColor.has(meta)) originalMetaColor.set(meta, meta.content);
    meta.content =
      next === "system" || !paper ? (originalMetaColor.get(meta) ?? meta.content) : paper;
  }
}

export function initTheme(): void {
  mode.value = readStored();
  apply(mode.value);
  watch(mode, (next) => {
    try {
      if (next === "system") localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode: the choice just won't persist */
    }
    apply(next);
  });
}

export function useTheme() {
  return { mode };
}
