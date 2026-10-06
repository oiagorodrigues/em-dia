/** Postgres hands timestamps back as Date; the domain speaks ISO-8601 strings. */
export const iso = (d: Date): string => d.toISOString();
export const isoOrNull = (d: Date | null): string | null => (d ? d.toISOString() : null);
export const date = (s: string): Date => new Date(s);
export const dateOrNull = (s: string | null): Date | null => (s ? new Date(s) : null);
