/** Formats Brazilian digits as they are typed: "(11) 91234-5678", "(11) 3456-7890". */
export function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  // Mobile numbers have 9 digits after the DDD, landlines 8.
  const head = d.length === 11 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, head)}-${rest.slice(head)}`;
}
