import { DEFAULT_TIMEZONE, nowInZone } from "@emdia/shared";
import { onScopeDispose, ref } from "vue";

/** Household-local date and HH:MM, ticking on the minute (plus seconds for the clock face). */
export function useNow(timeZone = DEFAULT_TIMEZONE) {
  const now = ref(new Date());
  const zoned = ref(nowInZone(timeZone, now.value));
  const seconds = ref(now.value.getSeconds());
  const timer = setInterval(() => {
    now.value = new Date();
    seconds.value = now.value.getSeconds();
    const next = nowInZone(timeZone, now.value);
    if (next.time !== zoned.value.time || next.date !== zoned.value.date) zoned.value = next;
  }, 1000);
  onScopeDispose(() => clearInterval(timer));
  return { zoned, seconds };
}
