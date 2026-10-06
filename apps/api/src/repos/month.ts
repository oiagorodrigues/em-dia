import { shiftMonth, type YearMonth } from "@emdia/shared";

/** [first day, first day of the next month) as ISO dates, for range filters on `date` columns. */
export function monthRange(month: YearMonth): [string, string] {
  return [`${month}-01`, `${shiftMonth(month, 1)}-01`];
}
