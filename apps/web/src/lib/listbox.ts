import { foldText } from "./text.ts";

export interface Option<V extends string | number = string> {
  value: V;
  label: string;
  description?: string;
  disabled?: boolean;
}

/**
 * Type-ahead: the next enabled option (after `from`, wrapping) whose label starts with the
 * typed text. Repeating one letter cycles through the options starting with it.
 */
export function typeahead<V extends string | number>(
  options: readonly Option<V>[],
  query: string,
  from: number,
): number {
  const q = foldText(query);
  if (!q || options.length === 0) return -1;
  const cycling = q.length > 1 && q.split("").every((c) => c === q[0]);
  const needle = cycling ? q[0]! : q;
  const start = cycling || q.length === 1 ? from + 1 : from;
  for (let k = 0; k < options.length; k++) {
    const i = (start + k + options.length) % options.length;
    const o = options[i]!;
    if (!o.disabled && foldText(o.label).startsWith(needle)) return i;
  }
  return -1;
}

/** Next enabled index moving by `step` (±1), clamped at the ends (listboxes don't wrap). */
export function moveActive<V extends string | number>(
  options: readonly Option<V>[],
  from: number,
  step: 1 | -1,
): number {
  let i = from;
  for (let k = 0; k < options.length; k++) {
    const next = i + step;
    if (next < 0 || next >= options.length) return i < 0 ? firstEnabled(options) : i;
    i = next;
    if (!options[i]!.disabled) return i;
  }
  return from;
}

export function firstEnabled<V extends string | number>(
  options: readonly Option<V>[],
  fromEnd = false,
): number {
  const idx = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  return (fromEnd ? idx[idx.length - 1] : idx[0]) ?? -1;
}
