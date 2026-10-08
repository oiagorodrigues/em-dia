import { reactive, ref, toRaw, type UnwrapRef } from "vue";
import { ApiError } from "@/api";

interface Issue {
  path: readonly PropertyKey[];
  message: string;
}

/** Structural slice of a zod schema, so the web app needn't depend on zod directly. */
export interface Parser<Out> {
  safeParse(
    value: unknown,
  ): { success: true; data: Out } | { success: false; error: { issues: Issue[] } };
}

/** A deep copy that also accepts reactive objects (a prop's contract), which structuredClone rejects. */
function plainCopy<T>(value: T): T {
  const raw = toRaw(value);
  if (Array.isArray(raw)) return raw.map(plainCopy) as T;
  if (raw && typeof raw === "object" && Object.getPrototypeOf(raw) === Object.prototype)
    return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, plainCopy(v)])) as T;
  return raw;
}

export function useForm<V extends object, Out>(schema: Parser<Out>, initial: V) {
  const values = reactive(plainCopy(initial)) as UnwrapRef<V>;
  const errors = ref<Record<string, string>>({});
  const formError = ref<string | null>(null);
  const submitting = ref(false);

  function validate(input: unknown = values): Out | null {
    const result = schema.safeParse(input);
    if (result.success) {
      errors.value = {};
      return result.data;
    }
    const next: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      next[key] ??= issue.message;
    }
    errors.value = next;
    return null;
  }

  function clearError(field: string): void {
    if (!(field in errors.value)) return;
    const { [field]: _, ...rest } = errors.value;
    errors.value = rest;
  }

  function applyError(e: unknown): void {
    if (e instanceof ApiError) {
      const fieldErrors = Object.fromEntries(
        Object.entries(e.fieldErrors)
          .filter(([, msgs]) => msgs.length > 0)
          .map(([k, msgs]) => [k, msgs[0]!]),
      );
      errors.value = { ...errors.value, ...fieldErrors };
      formError.value =
        Object.keys(fieldErrors).length > 0 && e.code === "VALIDATION" ? null : e.message;
    } else {
      formError.value = "Algo deu errado. Tente de novo.";
    }
  }

  /** Validates, then runs `action` with parsed data; server errors land on fields or the form banner. */
  async function submit(action: (data: Out) => Promise<void>, input?: unknown): Promise<boolean> {
    if (submitting.value) return false;
    formError.value = null;
    const data = validate(input);
    if (!data) {
      focusFirstError();
      return false;
    }
    submitting.value = true;
    try {
      await action(data);
      return true;
    } catch (e) {
      applyError(e);
      focusFirstError();
      return false;
    } finally {
      submitting.value = false;
    }
  }

  function focusFirstError(): void {
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  }

  return { values, errors, formError, submitting, validate, submit, clearError, applyError };
}
