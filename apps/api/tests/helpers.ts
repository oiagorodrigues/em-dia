import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CreateContractInput, PublicUser, Role, ScheduleInput } from "@emdia/shared";
import request from "supertest";
import { loadConfig } from "../src/config/index.ts";
import { openDatabase } from "../src/db/index.ts";
import { createApp } from "../src/http/app.ts";
import { createLogger } from "../src/lib/logger.ts";
import { createDevMailer } from "../src/lib/mailer.ts";
import { createServices } from "../src/services/index.ts";

export const PASSWORD = "senha-forte-123";
/** Tuesday 2026-10-06, 12:00 in America/Sao_Paulo. */
export const DEFAULT_NOW = "2026-10-06T15:00:00.000Z";

export interface TestUser {
  token: string;
  cookie: string;
  user: PublicUser;
}

export function refreshCookie(res: request.Response): string {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const cookie = raw?.find((c) => c.startsWith("emdia_rt="));
  if (!cookie) throw new Error("no refresh cookie in response");
  return cookie.split(";")[0] ?? "";
}

/** API input, so the schedule may omit fields the schema defaults. */
export type ContractOverrides = Partial<Omit<CreateContractInput, "schedule">> & {
  schedule?: ScheduleInput;
};

let seq = 0;

export function setup(env: Record<string, string> = {}) {
  const uploadDir = mkdtempSync(join(tmpdir(), "emdia-api-test-"));
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_PATH: ":memory:",
    UPLOAD_DIR: uploadDir,
    JWT_SECRET: "test-secret-that-is-long-enough-0123456789",
    LOG_LEVEL: "silent",
    RATE_LIMIT_GLOBAL: "100000",
    RATE_LIMIT_AUTH: "100000",
    ...env,
  });
  let now = new Date(DEFAULT_NOW);
  const db = openDatabase(":memory:");
  const logger = createLogger("silent");
  const mailer = createDevMailer(logger);
  const services = createServices({ db, config, logger, mailer, clock: () => now });
  const app = createApp({ config, logger, services });
  const http = () => request(app);

  async function register(
    role: Role,
    extra: { email?: string; name?: string; inviteCode?: string } = {},
  ): Promise<TestUser> {
    const res = await http()
      .post("/api/v1/auth/register")
      .send({
        name: extra.name ?? (role === "employer" ? "Ana Contratante" : "Maria Profissional"),
        email: extra.email ?? `user${++seq}@test.dev`,
        password: PASSWORD,
        role,
        inviteCode: extra.inviteCode,
      });
    if (res.status !== 201)
      throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
    return { token: res.body.accessToken, user: res.body.user, cookie: refreshCookie(res) };
  }

  async function createContract(employer: TestUser, overrides: ContractOverrides = {}) {
    const res = await http()
      .post("/api/v1/contracts")
      .auth(employer.token, { type: "bearer" })
      .send({
        workerName: "Maria",
        occupation: "diarista",
        payType: "daily",
        rateCents: 18000,
        schedule: { kind: "weekly", weekdays: [1, 2, 3, 4, 5] },
        expectedStart: "08:00",
        expectedEnd: "16:00",
        startedOn: "2026-08-01",
        ...overrides,
      });
    if (res.status !== 201)
      throw new Error(`create contract failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.contract as { id: string; workerId: string | null };
  }

  /** Employer with one contract and a worker linked to it through an invite code. */
  async function linkedPair(overrides: ContractOverrides = {}) {
    const employer = await register("employer");
    const contract = await createContract(employer, overrides);
    const invite = await http()
      .post(`/api/v1/contracts/${contract.id}/invite`)
      .auth(employer.token, { type: "bearer" });
    const worker = await register("worker", { inviteCode: invite.body.code });
    return { employer, worker, contractId: contract.id };
  }

  /** Access tokens live 15 minutes; tests that move the clock further refresh them in place. */
  async function reauth(user: TestUser): Promise<void> {
    const res = await http()
      .post("/api/v1/auth/refresh")
      .set("X-Requested-With", "emdia")
      .set("Cookie", user.cookie);
    if (res.status !== 200) throw new Error(`refresh failed: ${res.status}`);
    user.token = res.body.accessToken;
    user.cookie = refreshCookie(res);
  }

  return {
    app,
    http,
    config,
    mailer,
    uploadDir,
    register,
    createContract,
    linkedPair,
    reauth,
    clock: {
      set: (iso: string) => {
        now = new Date(iso);
      },
      advance: (ms: number) => {
        now = new Date(now.getTime() + ms);
      },
    },
    cleanup: () => {
      db.close();
      rmSync(uploadDir, { recursive: true, force: true });
    },
  };
}

export type TestEnv = ReturnType<typeof setup>;
