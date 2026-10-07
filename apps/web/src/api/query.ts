import type { PiniaColadaOptions, QueryCache } from "@pinia/colada";
import { PiniaColadaRetry } from "@pinia/colada-plugin-retry";
import { ApiError } from "./client.ts";

const MAX_RETRIES = 2;

/** A 4xx will answer the same way again; only network failures and 5xx are worth retrying. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < MAX_RETRIES;
}

/** Options for the `PiniaColada` plugin. Tests pass `retry: false` so a failure shows at once. */
export function queryCacheOptions({ retry = true } = {}): PiniaColadaOptions {
  return {
    queryOptions: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    plugins: [PiniaColadaRetry({ retry: retry ? shouldRetry : 0 })],
  };
}

/**
 * Forgets every cached read, so one account never sees another's data. Entries a mounted
 * screen still uses go back to "nothing loaded"; Colada warns when an active entry is removed.
 */
export function clearQueryCache(cache: QueryCache): void {
  for (const entry of cache.getEntries()) {
    if (entry.active) {
      cache.setEntryState(entry, { status: "pending", data: undefined, error: null });
      cache.invalidate(entry);
    } else {
      cache.cancel(entry);
      cache.remove(entry);
    }
  }
}
