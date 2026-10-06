import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  announceLogout,
  ApiError,
  configureAuthHooks,
  filenameFromDisposition,
  getAccessToken,
  refreshSession,
  request,
  sanitizeFilename,
  setAccessToken,
} from "./client.ts";

const user = {
  id: "u1",
  email: "a@b.c",
  name: "Ana",
  role: "employer",
  phone: null,
  pixKey: null,
  createdAt: "",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function headersOf(call: Parameters<typeof fetch> | undefined): Record<string, string> {
  return (call?.[1]?.headers ?? {}) as Record<string, string>;
}

function urlOf(input: Parameters<typeof fetch>[0]): string {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

const expired = () => json(401, { error: { code: "TOKEN_EXPIRED", message: "Sessão expirada" } });

describe("api client", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const onSession = vi.fn();
  const onSessionLost = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    onSession.mockReset();
    onSessionLost.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    configureAuthHooks({ onSession, onSessionLost });
    announceLogout();
    setAccessToken("old");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the bearer token and cookies", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    await request("/me");
    const call = fetchMock.mock.calls[0];
    expect(call?.[0]).toBe("/api/v1/me");
    expect(call?.[1]?.credentials).toBe("include");
    expect(headersOf(call).Authorization).toBe("Bearer old");
  });

  it("refreshes once on TOKEN_EXPIRED and retries with the new token", async () => {
    fetchMock
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(json(200, { accessToken: "new", user }))
      .mockResolvedValueOnce(json(200, { value: 42 }));

    await expect(request<{ value: number }>("/dashboard")).resolves.toEqual({ value: 42 });

    const refreshCall = fetchMock.mock.calls[1];
    expect(refreshCall?.[0]).toBe("/api/v1/auth/refresh");
    expect(headersOf(refreshCall)["X-Requested-With"]).toBe("emdia");
    expect(headersOf(fetchMock.mock.calls[2]).Authorization).toBe("Bearer new");
    expect(getAccessToken()).toBe("new");
    expect(onSession).toHaveBeenCalledOnce();
  });

  it("shares a single refresh between concurrent 401s", async () => {
    let releaseRefresh!: () => void;
    fetchMock.mockImplementation(async (input) => {
      const url = urlOf(input);
      if (url.endsWith("/auth/refresh")) {
        await new Promise<void>((r) => (releaseRefresh = r));
        return json(200, { accessToken: "new", user });
      }
      return getAccessToken() === "new" ? json(200, { url }) : expired();
    });

    const all = Promise.all([request("/a"), request("/b"), request("/c")]);
    await vi.waitFor(() => expect(releaseRefresh).toBeTypeOf("function"));
    releaseRefresh();
    await all;

    const refreshes = fetchMock.mock.calls.filter(([u]) => urlOf(u).endsWith("/auth/refresh"));
    expect(refreshes).toHaveLength(1);
  });

  it("logs out when the refresh fails", async () => {
    fetchMock
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(json(401, { error: { code: "UNAUTHENTICATED", message: "x" } }));

    await expect(request("/me")).rejects.toBeInstanceOf(ApiError);
    expect(onSessionLost).toHaveBeenCalledOnce();
    expect(getAccessToken()).toBeNull();
  });

  it("does not retry more than once", async () => {
    fetchMock
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(json(200, { accessToken: "new", user }))
      .mockResolvedValueOnce(expired());

    await expect(request("/me")).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onSessionLost).toHaveBeenCalledOnce();
  });

  it("treats UNAUTHENTICATED as a lost session without refreshing", async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, { error: { code: "UNAUTHENTICATED", message: "Entre de novo" } }),
    );
    await expect(request("/me")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(onSessionLost).toHaveBeenCalledOnce();
  });

  it("serialises refreshes through the cross-tab lock when available", async () => {
    const lockRequest = vi.fn((_name: string, fn: () => Promise<unknown>) => fn());
    vi.stubGlobal("navigator", { userAgent: navigator.userAgent, locks: { request: lockRequest } });
    fetchMock
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(json(200, { accessToken: "new", user }))
      .mockResolvedValueOnce(json(200, {}));
    await request("/me");
    expect(lockRequest).toHaveBeenCalledWith("emdia-refresh", expect.any(Function));
  });

  it("does not try to refresh on other errors", async () => {
    fetchMock.mockResolvedValueOnce(
      json(403, { error: { code: "FORBIDDEN", message: "Sem permissão" } }),
    );
    await expect(request("/x")).rejects.toMatchObject({ status: 403, message: "Sem permissão" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("exposes zod field errors from VALIDATION responses", async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, {
        error: {
          code: "VALIDATION",
          message: "Dados inválidos",
          details: { fieldErrors: { email: ["E-mail inválido"] }, formErrors: [] },
        },
      }),
    );
    const err: unknown = await request("/auth/register", {
      method: "POST",
      body: {},
      auth: false,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).fieldErrors).toEqual({ email: ["E-mail inválido"] });
  });

  it("turns network failures into a pt-BR NETWORK error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(request("/x")).rejects.toMatchObject({
      code: "NETWORK",
      message: expect.stringContaining("conexão"),
    });
  });

  it("falls back to a friendly message when the body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("Bad gateway", { status: 502 }));
    await expect(request("/x")).rejects.toMatchObject({
      code: "INTERNAL",
      message: expect.stringContaining("errado"),
    });
  });

  it("returns null from refreshSession when there is no session", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: { code: "UNAUTHENTICATED", message: "" } }));
    await expect(refreshSession()).resolves.toBeNull();
  });
});

describe("filenames", () => {
  it("reads and sanitises Content-Disposition", () => {
    expect(filenameFromDisposition('inline; filename="comprovante-2026-10.pdf"')).toBe(
      "comprovante-2026-10.pdf",
    );
    expect(filenameFromDisposition("attachment; filename*=UTF-8''extrato%20out.csv")).toBe(
      "extrato out.csv",
    );
    expect(filenameFromDisposition(null)).toBeNull();
  });

  it("strips path separators and control characters", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(sanitizeFilename("a\u0000b<script>.png")).toBe("a_b_script_.png");
    expect(sanitizeFilename("...")).toBe("arquivo");
  });
});
