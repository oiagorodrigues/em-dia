const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

/** Excel pt-BR: `;` separator, quotes doubled, formula-looking cells neutralised with `'`. */
export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let s = String(value);
  if (FORMULA_PREFIX_RE.test(s)) s = `'${s}`;
  if (/[;"\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: (string | number | null)[][]): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

/** 123456 → "1234,56" so Excel pt-BR reads it as a number. */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}
