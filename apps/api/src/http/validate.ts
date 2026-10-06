import { z } from "zod";
import { AppError } from "../lib/errors.ts";

export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError("VALIDATION", "Verifique os dados informados", z.flattenError(result.error));
  }
  return result.data;
}
