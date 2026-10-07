import {
  toCacheKey,
  useQuery,
  useQueryCache,
  type EntryKey,
  type UseQueryEntry,
} from "@pinia/colada";
import { computed, toValue, type MaybeRefOrGetter, type Ref } from "vue";
import { ApiError } from "@/api";
import { staleAfterContract, staleAfterRecords } from "@/api/keys.ts";

export interface Resource<T> {
  data: Readonly<Ref<T | undefined>>;
  error: Readonly<Ref<ApiError | null>>;
  /** True only while there is nothing to show yet; a cached value renders at once and refreshes behind it. */
  loading: Readonly<Ref<boolean>>;
  /** True during any request, including a background refresh of cached data. */
  fetching: Readonly<Ref<boolean>>;
  key: Readonly<Ref<EntryKey | null>>;
  reload: () => Promise<void>;
  /** Replace the cached data (optimistic or with a server response) without refetching. */
  mutate: (next: T | ((prev: T | undefined) => T)) => void;
}

/**
 * Cached read of `fetcher(source)`, stored under `key(source)` (see `@/api/keys.ts`). A `null`
 * key means there is nothing to fetch yet. The fetcher receives the value its key was built
 * from, so a late answer or a retry for an old month can only land in that month's cache entry.
 */
export function useResource<T, S>(
  source: MaybeRefOrGetter<S>,
  key: (value: S) => EntryKey | null,
  fetcher: (value: S) => Promise<T>,
): Resource<T> {
  const cache = useQueryCache();
  const current = computed(() => {
    const value = toValue(source);
    return { value, key: key(value) };
  });

  const query = useQuery<T, unknown>(() => {
    const { value, key: entryKey } = current.value;
    return {
      key: entryKey ?? ["disabled"],
      query: () => fetcher(value),
      enabled: entryKey !== null,
    };
  });

  return {
    data: query.data,
    error: computed(() => {
      const e = query.error.value;
      if (e == null) return null;
      return e instanceof ApiError ? e : new ApiError(0, "INTERNAL", "");
    }),
    loading: computed(() => current.value.key !== null && query.isPending.value),
    // The retry plugin leaves the entry idle while it waits to try again.
    fetching: computed(() => query.asyncStatus.value === "loading" || query.isRetrying.value),
    key: computed(() => current.value.key),
    reload: async () => {
      if (current.value.key !== null) await query.refetch();
    },
    mutate: (next) => {
      const entryKey = current.value.key;
      if (entryKey === null) return;
      cache.setQueryData<T | undefined>(entryKey, (prev) =>
        typeof next === "function" ? (next as (prev: T | undefined) => T)(prev) : next,
      );
    },
  };
}

type Cached = Pick<Resource<unknown>, "key">;

/**
 * Marks cached reads stale after a write, so every screen that shows them refetches (now if it
 * is on screen, otherwise when it opens). Pass the resources the write already updated with
 * `mutate` as `fresh` to skip refetching them.
 */
export function useInvalidate() {
  const cache = useQueryCache();

  // Like `cache.invalidateQueries`, but waits for every refetch and never rejects: a failed
  // refetch shows up as that read's error, not as a failure of the write that triggered it.
  async function refetch(entries: UseQueryEntry[]): Promise<void> {
    for (const entry of entries) cache.invalidate(entry);
    const onScreen = entries.filter((e) => e.active && toValue(e.options?.enabled));
    await Promise.all(onScreen.map((entry) => cache.fetch(entry).catch(() => {})));
  }

  function run(stale: (entry: UseQueryEntry) => boolean, fresh: readonly Cached[]): Promise<void> {
    const skip = new Set(fresh.flatMap((r) => (r.key.value ? [toCacheKey(r.key.value)] : [])));
    return refetch(
      cache.getEntries({ predicate: (entry) => stale(entry) && !skip.has(entry.keyHash) }),
    );
  }

  return {
    /** Entries, adjustments, payments or agreements of one contract changed. */
    records: (contractId: string, ...fresh: Cached[]) => run(staleAfterRecords(contractId), fresh),
    /** The contract itself changed (edited, ended, removed, restored). */
    contract: (contractId: string, ...fresh: Cached[]) =>
      run(staleAfterContract(contractId), fresh),
    /** A write whose reach is unknown here, such as an action inside a feature component. */
    all: () => refetch(cache.getEntries()),
  };
}
