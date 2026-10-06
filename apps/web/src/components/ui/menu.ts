import type { RouteLocationRaw } from "vue-router";
import type { IconName } from "./icons.ts";

export interface MenuItem {
  label: string;
  icon?: IconName;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

/** An action shown as a colored icon button in a table row. */
export interface InlineAction {
  label: string;
  icon: IconName;
  tone?: "neutral" | "brand" | "amber" | "coral";
  to?: RouteLocationRaw;
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export interface ActionLayout {
  inline: InlineAction[];
  menu: MenuItem[];
}

/**
 * One action → one inline button. More than one → at most `maxInline` inline (the most
 * frequent come first), everything else in the ⋯ menu. A lone menu item becomes inline too.
 */
export function layoutActions(
  inline: readonly InlineAction[],
  menu: readonly MenuItem[],
  maxInline = 2,
): ActionLayout {
  const total = inline.length + menu.length;
  if (total === 0) return { inline: [], menu: [] };
  if (total === 1) {
    if (inline.length) return { inline: [...inline], menu: [] };
    const only = menu[0]!;
    return {
      inline: [
        {
          label: only.label,
          icon: only.icon ?? "more",
          tone: only.danger ? "coral" : "neutral",
          onClick: only.onSelect,
          disabled: only.disabled,
        },
      ],
      menu: [],
    };
  }
  const shown = inline.slice(0, maxInline);
  const overflow: MenuItem[] = inline.slice(maxInline).map((a) => ({
    label: a.label,
    icon: a.icon,
    disabled: a.disabled,
    onSelect: a.onClick ?? (() => {}),
  }));
  return { inline: shown, menu: [...overflow, ...menu] };
}
