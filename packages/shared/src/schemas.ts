import { z } from "zod";
import {
  ADJUSTMENT_KINDS,
  ENTRY_STATUSES,
  OCCUPATIONS,
  PAY_TYPES,
  PAYMENT_METHODS,
  ROLES,
} from "./domain.ts";
import { SCHEDULE_KINDS } from "./schedule.ts";
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

export const scheduleSchema = z
  .object({
    kind: z.enum(SCHEDULE_KINDS),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    everyWeeks: z.number().int().min(1).max(12).default(1),
    monthDays: z.array(z.number().int().min(1).max(31)).max(31).default([]),
    visitsPerMonth: z.number().int().min(1).max(31).nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "weekly" && v.weekdays.length === 0) {
      ctx.addIssue({ code: "custom", path: ["weekdays"], message: "Escolha pelo menos um dia" });
    }
    if (v.kind === "month_days" && v.monthDays.length === 0) {
      ctx.addIssue({ code: "custom", path: ["monthDays"], message: "Escolha pelo menos uma data" });
    }
    if (v.kind === "per_month" && v.visitsPerMonth === null) {
      ctx.addIssue({ code: "custom", path: ["visitsPerMonth"], message: "Quantas vezes por mês?" });
    }
  })
  .transform((v) => ({
    kind: v.kind,
    weekdays: v.kind === "weekly" ? [...new Set(v.weekdays)].sort((a, b) => a - b) : [],
    everyWeeks: v.kind === "weekly" ? v.everyWeeks : 1,
    monthDays: v.kind === "month_days" ? [...new Set(v.monthDays)].sort((a, b) => a - b) : [],
    visitsPerMonth: v.kind === "per_month" ? v.visitsPerMonth : null,
  }));
export type ScheduleInput = z.input<typeof scheduleSchema>;

const contractBase = z.object({
  workerName: personName,
  occupation: z.enum(OCCUPATIONS),
  payType: z.enum(PAY_TYPES),
  rateCents: cents.min(1, "Informe o valor"),
  schedule: scheduleSchema,
  deductAbsences: z.boolean(),
  expectedStart: clockTime.nullable(),
  expectedEnd: clockTime.nullable(),
  startedOn: isoDate,
});

const optionalEmail = z
  .union([email, z.literal("")])
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v || null));
const optionalPhone = z
  .string()
  .trim()
  .max(30)
  .refine((v) => v === "" || v.replace(/\D/g, "").length >= 10, "Telefone com DDD")
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v || null));

export const createContractSchema = contractBase.extend({
  deductAbsences: z.boolean().default(false),
  contactEmail: optionalEmail,
  contactPhone: optionalPhone,
  householdId: z.string().min(1).optional(),
});
export type CreateContractInput = z.infer<typeof createContractSchema>;

export const updateContractSchema = contractBase.partial().extend({
  contactEmail: optionalEmail,
  contactPhone: optionalPhone,
});
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
export const createPaymentSchema = z
  .object({
    referenceMonth: yearMonth,
    paidOn: isoDate,
    amountCents: z.coerce.number().int().min(1).max(100_000_000),
    method: z.enum(PAYMENT_METHODS),
    note: shortText.nullable().optional(),
    agreementId: z.string().min(1).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.agreementId && v.method !== "compensation") {
      ctx.addIssue({
        code: "custom",
        path: ["method"],
        message: "Acordos são abatidos como compensação",
      });
    }
    if (v.method === "compensation" && !v.agreementId && !v.note) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "Diga com o que foi compensado" });
    }
  });
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const createAgreementSchema = z
  .object({
    description: z.string().trim().min(2, "Descreva o acordo").max(200),
    totalCents: cents.min(1, "Informe o valor"),
    installmentCents: cents.min(1).nullable().default(null),
    startMonth: yearMonth,
  })
  .refine((v) => v.installmentCents === null || v.installmentCents <= v.totalCents, {
    path: ["installmentCents"],
    message: "A parcela não pode passar do total",
  });
export type CreateAgreementInput = z.infer<typeof createAgreementSchema>;

/** Typing the word protects against a stray click; the password proves it's the owner. */
export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(128),
  confirm: z.literal("EXCLUIR", { error: "Digite EXCLUIR para confirmar" }),
});

export const monthQuerySchema = z.object({ month: yearMonth });
export const yearQuerySchema = z.object({ year: z.coerce.number().int().min(2000).max(2100) });
