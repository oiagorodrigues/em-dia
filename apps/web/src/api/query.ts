import { QueryClient } from "@tanstack/vue-query";
import { ApiError } from "./client.ts";

const MAX_RETRIES = 2;

/** A 4xx will answer the same way again; only network failures and 5xx are worth retrying. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < MAX_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: shouldRetry,
        // Fetch even when the browser reports offline, so a failed read shows its error instead of a skeleton that never ends.
        networkMode: "always",
      },
    },
  });
}

/** The app's single cache. The auth store clears it on logout so one account never sees another's data. */
export const queryClient = createQueryClient();
