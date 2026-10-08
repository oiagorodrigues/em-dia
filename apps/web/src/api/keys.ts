import type { YearMonth } from "@emdia/shared";
import type { EntryKey, UseQueryEntry } from "@pinia/colada";

/**
 * Query keys for every cached read. Everything about one contract sits under
 * `["contract", id]`, so a single prefix reaches its summary, entries, payments and so on.
 */
export const queryKeys = {
  contracts: () => ["contracts"] as const,
  contractsWithArchived: () => ["contracts", "archived"] as const,
  contract: (id: string) => ["contract", id] as const,
  activity: (id: string) => ["contract", id, "activity"] as const,
  /** Removed agreements included: every reader filters what it shows. */
  agreements: (id: string) => ["contract", id, "agreements"] as const,
  summary: (p: { id: string; month: YearMonth }) => ["contract", p.id, "summary", p.month] as const,
  entries: (p: { id: string; month: YearMonth }) => ["contract", p.id, "entries", p.month] as const,
  advances: (id: string) => ["contract", id, "advances"] as const,
  payments: (p: { id: string; year: number }) => ["contract", p.id, "payments", p.year] as const,
  team: (month: YearMonth) => ["team", month] as const,
  teamWithArchived: (month: YearMonth) => ["team", month, "archived"] as const,
  /** No month is the server's current month. */
  dashboard: (month?: YearMonth) => ["dashboard", month ?? "current"] as const,
  board: (month: YearMonth) => ["board", month] as const,
  teamPayments: (year: number) => ["teamPayments", year] as const,
};

/** Reads that combine several contracts; any write to one contract can change them. */
const AGGREGATES: EntryKey[] = [["team"], ["dashboard"], ["board"], ["teamPayments"]];

function startsWith(key: EntryKey, prefix: EntryKey): boolean {
  return prefix.every((part, i) => key[i] === part);
}

type Entry = Pick<UseQueryEntry, "key">;

/** Entries, payments or agreements of one contract changed; the contract itself did not. */
export function staleAfterRecords(contractId: string): (entry: Entry) => boolean {
  return ({ key }) =>
    (key.length > 2 && startsWith(key, queryKeys.contract(contractId))) ||
    AGGREGATES.some((p) => startsWith(key, p));
}

/** The contract changed (edited, ended, removed, restored): everything that shows it. */
export function staleAfterContract(contractId: string): (entry: Entry) => boolean {
  return ({ key }) =>
    startsWith(key, queryKeys.contract(contractId)) ||
    startsWith(key, queryKeys.contracts()) ||
    AGGREGATES.some((p) => startsWith(key, p));
}
