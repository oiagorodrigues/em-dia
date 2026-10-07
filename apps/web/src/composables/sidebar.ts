import { onBeforeUnmount, ref, watch } from "vue";

export const SIDEBAR_STORAGE_KEY = "emdia:sidebar";

function readStored(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "collapsed";
  } catch {
    return false;
  }
}

function store(collapsed: boolean): void {
  try {
    if (collapsed) localStorage.setItem(SIDEBAR_STORAGE_KEY, "collapsed");
    else localStorage.removeItem(SIDEBAR_STORAGE_KEY);
  } catch {
    /* private mode: the choice just won't persist */
  }
}

/**
 * The sidebar's collapsed (icons only) state, remembered per browser. It is mirrored on
 * `<html data-sidebar="collapsed">` so the shell, banners and toasts follow `--sidebar-w`.
 */
export function useSidebarCollapse() {
  const collapsed = ref(readStored());
  const root = document.documentElement;

  watch(
    collapsed,
    (next, prev) => {
      if (next) root.dataset.sidebar = "collapsed";
      else delete root.dataset.sidebar;
      if (prev !== undefined) store(next);
    },
    { immediate: true },
  );

  let settle: ReturnType<typeof setTimeout> | undefined;
  onBeforeUnmount(() => {
    clearTimeout(settle);
    delete root.dataset.sidebar;
    delete root.dataset.sidebarMoving;
  });

  // Width changes animate only on a toggle; on first paint the shell must not slide into place.
  function toggle(): void {
    root.dataset.sidebarMoving = "";
    clearTimeout(settle);
    settle = setTimeout(() => delete root.dataset.sidebarMoving, 400);
    collapsed.value = !collapsed.value;
  }

  return { collapsed, toggle };
}
