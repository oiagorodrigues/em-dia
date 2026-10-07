import type { YearMonth } from "@emdia/shared";
import type { Query, QueryKey } from "@tanstack/vue-query";

/**
 * Query keys for every cached read. Everything about one contract sits under
 * `["contract", id]`, so a single prefix reaches its summary, entries, payments and so on.
 */
export const queryKeys = {
  contracts: () => ["contracts"] as const,
  contract: (id: string) => ["contract", id] as const,
  activity: (id: string) => ["contract", id, "activity"] as const,
  agreements: (id: string) => ["contract", id, "agreements"] as const,
  summary: (p: { id: string; month: YearMonth }) => ["contract", p.id, "summary", p.month] as const,
  entries: (p: { id: string; month: YearMonth }) => ["contract", p.id, "entries", p.month] as const,
  adjustments: (p: { id: string; month: YearMonth }) =>
    ["contract", p.id, "adjustments", p.month] as const,
  payments: (p: { id: string; year: number }) => ["contract", p.id, "payments", p.year] as const,
  team: (month: YearMonth) => ["team", month] as const,
  teamWithArchived: (month: YearMonth) => ["team", month, "archived"] as const,
  /** No month is the server's current month. */
  dashboard: (month?: YearMonth) => ["dashboard", month ?? "current"] as const,
  board: (month: YearMonth) => ["board", month] as const,
  teamPayments: (year: number) => ["teamPayments", year] as const,
};

/** Reads that combine several contracts; any write to one contract can change them. */
const AGGREGATES: QueryKey[] = [["team"], ["dashboard"], ["board"], ["teamPayments"]];

function startsWith(key: QueryKey, prefix: QueryKey): boolean {
  return prefix.every((part, i) => key[i] === part);
}

/** Entries, adjustments, payments or agreements of one contract changed; the contract itself did not. */
export function staleAfterRecords(contractId: string): (query: Query) => boolean {
  return ({ queryKey }) =>
    (queryKey.length > 2 && startsWith(queryKey, queryKeys.contract(contractId))) ||
    AGGREGATES.some((p) => startsWith(queryKey, p));
}

/** The contract changed (edited, ended, removed, restored): everything that shows it. */
export function staleAfterContract(contractId: string): (query: Query) => boolean {
  return ({ queryKey }) =>
    startsWith(queryKey, queryKeys.contract(contractId)) ||
    startsWith(queryKey, queryKeys.contracts()) ||
    AGGREGATES.some((p) => startsWith(queryKey, p));
}
