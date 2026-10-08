import type {
  FeedbackInput,
  ActivityItem,
  Agreement,
  Contract,
  CreateAgreementInput,
  CreateContractInput,
  DashboardItem,
  Household,
  InviteDelivery,
  IsoDate,
  LoginInput,
  MonthSummary,
  Payment,
  PublicUser,
  RegisterInput,
  UpdateContractInput,
  UpdateMeInput,
  UpdatePaymentInput,
  UpsertEntryInput,
  WorkEntry,
  YearMonth,
} from "@emdia/shared";
import { request, requestBlob, type Session } from "./client.ts";

export { ApiError, errorMessage, type Session } from "./client.ts";

const csrf = { "X-Requested-With": "emdia" };

export const authApi = {
  login: (body: LoginInput) =>
    request<Session>("/auth/login", { method: "POST", body, auth: false }),
  register: (body: RegisterInput) =>
    request<Session>("/auth/register", { method: "POST", body, auth: false }),
  logout: () => request<void>("/auth/logout", { method: "POST", auth: false, headers: csrf }),
  logoutAll: () => request<void>("/auth/logout-all", { method: "POST", headers: csrf }),
  forgotPassword: (email: string) =>
    request<void>("/auth/forgot-password", { method: "POST", body: { email }, auth: false }),
  resetPassword: (token: string, password: string) =>
    request<void>("/auth/reset-password", {
      method: "POST",
      body: { token, password },
      auth: false,
    }),
};

export const feedbackApi = {
  /** Mailed to the team with the user's e-mail as reply-to; 204. */
  send: (body: FeedbackInput) => request<void>("/feedback", { method: "POST", body }),
};

export const meApi = {
  get: () => request<{ user: PublicUser }>("/me"),
  update: (body: UpdateMeInput) => request<{ user: PublicUser }>("/me", { method: "PATCH", body }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ accessToken?: string } | undefined>("/me/password", {
      method: "POST",
      body: { currentPassword, newPassword },
    }),
  /** Anonymises the account (the other party keeps the shared history); 204, session ends. */
  deleteAccount: (password: string, confirm: string) =>
    request<void>("/me", { method: "DELETE", body: { password, confirm } }),
};

export const householdsApi = {
  list: () => request<{ households: Household[] }>("/households"),
};

export const contractsApi = {
  list: (opts: { archived?: boolean } = {}) =>
    request<{ contracts: Contract[] }>("/contracts", {
      query: { include: opts.archived ? "archived" : undefined },
    }),
  get: (id: string) => request<{ contract: Contract }>(`/contracts/${enc(id)}`),
  create: (body: CreateContractInput) =>
    request<{ contract: Contract; invite: InviteDelivery | null }>("/contracts", {
      method: "POST",
      body,
    }),
  /** Logical removal: sets archivedAt, keeps the history. */
  remove: (id: string) => request<void>(`/contracts/${enc(id)}`, { method: "DELETE" }),
  restore: (id: string) =>
    request<{ contract: Contract }>(`/contracts/${enc(id)}/restore`, { method: "POST" }),
  update: (id: string, body: UpdateContractInput) =>
    request<{ contract: Contract }>(`/contracts/${enc(id)}`, { method: "PATCH", body }),
  end: (id: string, endedOn: IsoDate) =>
    request<{ contract: Contract }>(`/contracts/${enc(id)}/end`, {
      method: "POST",
      body: { endedOn },
    }),
  invite: (id: string) =>
    request<{ invite: InviteDelivery }>(`/contracts/${enc(id)}/invite`, {
      method: "POST",
    }),
  join: (code: string) =>
    request<{ contract: Contract }>("/contracts/join", { method: "POST", body: { code } }),
  summary: (id: string, month: YearMonth) =>
    request<{ summary: MonthSummary }>(`/contracts/${enc(id)}/summary`, { query: { month } }),
  statementCsv: (id: string, month: YearMonth) =>
    requestBlob(`/contracts/${enc(id)}/statement.csv`, { query: { month } }),
  activity: (id: string, limit = 50) =>
    request<{ activity: ActivityItem[] }>(`/contracts/${enc(id)}/activity`, { query: { limit } }),
};

export const entriesApi = {
  list: (contractId: string, month: YearMonth) =>
    request<{ entries: WorkEntry[] }>(`/contracts/${enc(contractId)}/entries`, {
      query: { month },
    }),
  upsert: (contractId: string, date: IsoDate, body: UpsertEntryInput) =>
    request<{ entry: WorkEntry }>(`/contracts/${enc(contractId)}/entries/${date}`, {
      method: "PUT",
      body,
    }),
  remove: (contractId: string, date: IsoDate) =>
    request<void>(`/contracts/${enc(contractId)}/entries/${date}`, { method: "DELETE" }),
  confirm: (contractId: string, date: IsoDate) =>
    request<{ entry: WorkEntry }>(`/contracts/${enc(contractId)}/entries/${date}/confirm`, {
      method: "POST",
    }),
  clock: (contractId: string, action: "in" | "out") =>
    request<{ entry: WorkEntry }>(`/contracts/${enc(contractId)}/clock`, {
      method: "POST",
      body: { action },
    }),
};

export const agreementsApi = {
  list: (contractId: string, opts: { archived?: boolean } = {}) =>
    request<{ agreements: Agreement[] }>(`/contracts/${enc(contractId)}/agreements`, {
      query: { include: opts.archived ? "archived" : undefined },
    }),
  create: (contractId: string, body: CreateAgreementInput) =>
    request<{ agreement: Agreement }>(`/contracts/${enc(contractId)}/agreements`, {
      method: "POST",
      body,
    }),
  accept: (contractId: string, id: string) =>
    request<{ agreement: Agreement }>(
      `/contracts/${enc(contractId)}/agreements/${enc(id)}/accept`,
      { method: "POST" },
    ),
  cancel: (contractId: string, id: string) =>
    request<{ agreement: Agreement }>(
      `/contracts/${enc(contractId)}/agreements/${enc(id)}/cancel`,
      { method: "POST" },
    ),
  remove: (contractId: string, id: string) =>
    request<void>(`/contracts/${enc(contractId)}/agreements/${enc(id)}`, { method: "DELETE" }),
  restore: (contractId: string, id: string) =>
    request<{ agreement: Agreement }>(
      `/contracts/${enc(contractId)}/agreements/${enc(id)}/restore`,
      { method: "POST" },
    ),
};

export const paymentsApi = {
  list: (contractId: string, year: number) =>
    request<{ payments: Payment[] }>(`/contracts/${enc(contractId)}/payments`, { query: { year } }),
  /** Every adiantamento of the contract, whatever its year, with what is left to abate. */
  advances: (contractId: string) =>
    request<{ advances: Payment[] }>(`/contracts/${enc(contractId)}/advances`),
  create: (contractId: string, form: FormData) =>
    request<{ payment: Payment }>(`/contracts/${enc(contractId)}/payments`, {
      method: "POST",
      body: form,
    }),
  replaceReceipt: (contractId: string, paymentId: string, form: FormData) =>
    request<{ payment: Payment }>(
      `/contracts/${enc(contractId)}/payments/${enc(paymentId)}/receipt`,
      {
        method: "PUT",
        body: form,
      },
    ),
  receipt: (contractId: string, paymentId: string) =>
    requestBlob(`/contracts/${enc(contractId)}/payments/${enc(paymentId)}/receipt`),
  remove: (contractId: string, paymentId: string) =>
    request<void>(`/contracts/${enc(contractId)}/payments/${enc(paymentId)}`, { method: "DELETE" }),
  acknowledge: (contractId: string, paymentId: string) =>
    request<{ payment: Payment }>(
      `/contracts/${enc(contractId)}/payments/${enc(paymentId)}/acknowledge`,
      {
        method: "POST",
      },
    ),
  update: (contractId: string, paymentId: string, body: UpdatePaymentInput) =>
    request<{ payment: Payment }>(`/contracts/${enc(contractId)}/payments/${enc(paymentId)}`, {
      method: "PATCH",
      body,
    }),
  confirm: (contractId: string, paymentId: string) =>
    request<{ payment: Payment }>(
      `/contracts/${enc(contractId)}/payments/${enc(paymentId)}/confirm`,
      { method: "POST" },
    ),
};

export const teamApi = {
  /** Every contract (active and ended; archived on request) with that month's summary. */
  list: (month: YearMonth, opts: { archived?: boolean } = {}) =>
    request<{ items: DashboardItem[]; month: YearMonth; today: IsoDate }>("/team", {
      query: { month, include: opts.archived ? "archived" : undefined },
    }),
};

export const dashboardApi = {
  /** Current month by default; any month (future ones carry only the estimate). */
  get: (month?: YearMonth) =>
    request<{ items: DashboardItem[]; month: YearMonth; today: IsoDate }>("/dashboard", {
      query: { month },
    }),
};

function enc(id: string): string {
  return encodeURIComponent(id);
}
