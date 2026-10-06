import { z } from "zod";
import {
  ADJUSTMENT_KINDS,
  ENTRY_STATUSES,
  OCCUPATIONS,
  PAY_TYPES,
  PAYMENT_METHODS,
  ROLES,
} from "./domain.ts";
import { CLOCK_RE, isValidIsoDate, YEAR_MONTH_RE } from "./time.ts";

export const isoDate = z.string().refine(isValidIsoDate, "Data inválida (AAAA-MM-DD)");
export const yearMonth = z.string().regex(YEAR_MONTH_RE, "Mês inválido (AAAA-MM)");
export const clockTime = z.string().regex(CLOCK_RE, "Horário inválido (HH:MM)");
export const cents = z.number().int().min(0).max(100_000_000);

export const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("E-mail inválido"))
  .pipe(z.string().max(254));

/** At least 10 chars, one letter and one digit. Max 128 to bound hashing cost. */
export const password = z
  .string()
  .min(10, "Use pelo menos 10 caracteres")
  .max(128, "Senha longa demais")
  .refine((v) => /[A-Za-zÀ-ÿ]/.test(v) && /\d/.test(v), "Use letras e números");

const personName = z.string().trim().min(2, "Nome curto demais").max(80);
const shortText = z.string().trim().max(500);

export const registerSchema = z.object({
  name: personName,
  email,
  password,
  role: z.enum(ROLES),
  /** Worker invite code; links the new account to a contract on signup. */
  inviteCode: z.string().trim().toUpperCase().length(8).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password,
});

export const updateMeSchema = z.object({
  name: personName.optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  pixKey: z.string().trim().max(140).nullable().optional(),
});
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});

export const householdSchema = z.object({
  name: z.string().trim().min(1).max(80),
  timezone: z.string().trim().max(64).optional(),
});

const contractBase = z.object({
  workerName: personName,
  occupation: z.enum(OCCUPATIONS),
  payType: z.enum(PAY_TYPES),
  rateCents: cents.min(1, "Informe o valor"),
  scheduleDays: z.array(z.number().int().min(0).max(6)).max(7),
  expectedStart: clockTime.nullable(),
  expectedEnd: clockTime.nullable(),
  startedOn: isoDate,
});

export const createContractSchema = contractBase.extend({
  householdId: z.string().min(1).optional(),
});
export type CreateContractInput = z.infer<typeof createContractSchema>;

export const updateContractSchema = contractBase.partial();
export type UpdateContractInput = z.infer<typeof updateContractSchema>;

export const endContractSchema = z.object({ endedOn: isoDate });

export const joinContractSchema = z.object({
  code: z.string().trim().toUpperCase().length(8),
});

export const upsertEntrySchema = z
  .object({
    status: z.enum(ENTRY_STATUSES),
    checkIn: clockTime.nullable(),
    checkOut: clockTime.nullable(),
    breakMinutes: z.number().int().min(0).max(720).default(0),
    note: shortText.nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status !== "worked" && (v.checkIn || v.checkOut)) {
      ctx.addIssue({ code: "custom", path: ["checkIn"], message: "Horários só quando trabalhou" });
    }
    if (v.status === "worked" && !v.checkIn) {
      ctx.addIssue({ code: "custom", path: ["checkIn"], message: "Informe a entrada" });
    }
  });
export type UpsertEntryInput = z.infer<typeof upsertEntrySchema>;

export const clockSchema = z.object({ action: z.enum(["in", "out"]) });

export const createAdjustmentSchema = z.object({
  month: yearMonth,
  kind: z.enum(ADJUSTMENT_KINDS),
  amountCents: cents.min(1),
  description: shortText.nullable().optional(),
});
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;

/** Multipart form fields arrive as strings; amountCents is coerced. */
export const createPaymentSchema = z.object({
  referenceMonth: yearMonth,
  paidOn: isoDate,
  amountCents: z.coerce.number().int().min(1).max(100_000_000),
  method: z.enum(PAYMENT_METHODS),
  note: shortText.nullable().optional(),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const monthQuerySchema = z.object({ month: yearMonth });
export const yearQuerySchema = z.object({ year: z.coerce.number().int().min(2000).max(2100) });
