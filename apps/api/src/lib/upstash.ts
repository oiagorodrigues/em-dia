/** Redis replies as rate-limit-redis expects them. */
export type RedisReply = string | number | boolean | (string | number | boolean)[];

/**
 * Sends one Redis command over Upstash's REST API (POST a JSON array, read
 * `{ result }` or `{ error }`). Plain fetch keeps the function free of a
 * long-lived TCP client, which serverless instances can't keep warm.
 */
export function upstashCommand(
  { url, token }: { url: string; token: string },
  fetchImpl: typeof fetch = fetch,
) {
  return async (...args: string[]): Promise<RedisReply> => {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(args),
    });
    const body = (await res.json()) as { result?: RedisReply; error?: string };
    if (!res.ok || body.error !== undefined) {
      throw new Error(`upstash ${args[0]} failed: ${body.error ?? res.status}`);
    }
    return body.result as RedisReply;
  };
}
