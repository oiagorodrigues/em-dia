import {
  DEFAULT_TIMEZONE,
  nowInZone,
  toYearMonth,
  YEAR_MONTH_RE,
  type Contract,
  type YearMonth,
} from "@emdia/shared";
import { computed, inject, provide, type ComputedRef, type InjectionKey, type Ref } from "vue";
import { useRoute, useRouter } from "vue-router";

export interface ContractContext {
  contract: Readonly<Ref<Contract>>;
  month: ComputedRef<YearMonth>;
  currentMonth: YearMonth;
  setMonth: (month: YearMonth) => void;
  replaceContract: (next: Contract) => void;
  /** Opens the removal confirmation owned by ContractView. */
  askRemove: () => void;
  restore: () => Promise<void>;
  restoring: Readonly<Ref<boolean>>;
}

const KEY: InjectionKey<ContractContext> = Symbol("contract");

/** The month lives in `?mes=` so it survives tab switches, reloads and shared links. */
export function useMonthQuery() {
  const route = useRoute();
  const router = useRouter();
  const currentMonth = toYearMonth(nowInZone(DEFAULT_TIMEZONE).date);
  const month = computed<YearMonth>(() => {
    const q = route.query.mes;
    return typeof q === "string" && YEAR_MONTH_RE.test(q) ? q : currentMonth;
  });
  function setMonth(next: YearMonth): void {
    const query = { ...route.query };
    if (next === currentMonth) delete query.mes;
    else query.mes = next;
    void router.replace({ query });
  }
  return { month, currentMonth, setMonth };
}

export function provideContract(ctx: ContractContext): void {
  provide(KEY, ctx);
}

export function useContract(): ContractContext {
  const ctx = inject(KEY);
  if (!ctx) throw new Error("useContract() outside ContractView");
  return ctx;
}
