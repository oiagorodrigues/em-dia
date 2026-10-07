import { hashKey, useQuery, useQueryClient, type Query, type QueryKey } from "@tanstack/vue-query";
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
  key: Readonly<Ref<QueryKey | null>>;
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
  key: (value: S) => QueryKey | null,
  fetcher: (value: S) => Promise<T>,
): Resource<T> {
  const client = useQueryClient();
  const current = computed(() => {
    const value = toValue(source);
    return { value, key: key(value) };
  });

  const query = useQuery<T, unknown, T, QueryKey>(() => {
    const { value, key: queryKey } = current.value;
    return {
      queryKey: queryKey ?? ["disabled"],
      queryFn: () => fetcher(value),
      enabled: queryKey !== null,
      shallow: true,
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
    fetching: query.isFetching,
    key: computed(() => current.value.key),
    reload: async () => {
      if (current.value.key !== null) await query.refetch();
    },
    mutate: (next) => {
      const queryKey = current.value.key;
      if (queryKey === null) return;
      client.setQueryData<T>(queryKey, (prev) =>
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
  const client = useQueryClient();

  function run(stale: (query: Query) => boolean, fresh: readonly Cached[]): Promise<void> {
    const skip = new Set(fresh.flatMap((r) => (r.key.value ? [hashKey(r.key.value)] : [])));
    return client.invalidateQueries({
      predicate: (query) => stale(query) && !skip.has(query.queryHash),
    });
  }

  return {
    /** Entries, adjustments, payments or agreements of one contract changed. */
    records: (contractId: string, ...fresh: Cached[]) => run(staleAfterRecords(contractId), fresh),
    /** The contract itself changed (edited, ended, removed, restored). */
    contract: (contractId: string, ...fresh: Cached[]) =>
      run(staleAfterContract(contractId), fresh),
    /** A write whose reach is unknown here, such as an action inside a feature component. */
    all: () => client.invalidateQueries(),
  };
}
