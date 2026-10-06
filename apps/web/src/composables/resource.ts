import {
  onScopeDispose,
  ref,
  shallowRef,
  watch,
  type Ref,
  type ShallowRef,
  type WatchSource,
} from "vue";
import { ApiError } from "@/api";

export interface Resource<T> {
  data: ShallowRef<T | undefined>;
  error: Ref<ApiError | null>;
  loading: Ref<boolean>;
  reload: () => Promise<void>;
  /** Replace data locally (optimistic or with a server response) without refetching. */
  mutate: (next: T | ((prev: T | undefined) => T)) => void;
}

/**
 * Fetches whenever `source` changes. Responses from superseded requests are
 * dropped so a fast month switch never shows the previous month's data.
 */
export function useResource<T, S>(
  source: WatchSource<S>,
  fetcher: (value: S) => Promise<T>,
): Resource<T> {
  const data = shallowRef<T>();
  const error = ref<ApiError | null>(null);
  const loading = ref(true);
  let seq = 0;
  let current: S;
  let disposed = false;

  async function run(value: S, keepData: boolean): Promise<void> {
    const id = ++seq;
    current = value;
    loading.value = true;
    error.value = null;
    if (!keepData) data.value = undefined;
    try {
      const result = await fetcher(value);
      if (id === seq && !disposed) data.value = result;
    } catch (e) {
      if (id === seq && !disposed)
        error.value = e instanceof ApiError ? e : new ApiError(0, "INTERNAL", "");
    } finally {
      if (id === seq && !disposed) loading.value = false;
    }
  }

  watch(source, (value) => void run(value, false), { immediate: true });
  onScopeDispose(() => (disposed = true));

  return {
    data,
    error,
    loading,
    reload: () => run(current, true),
    mutate: (next) => {
      data.value =
        typeof next === "function" ? (next as (prev: T | undefined) => T)(data.value) : next;
    },
  };
}
