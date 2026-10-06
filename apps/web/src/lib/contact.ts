/** Brazilian numbers are stored as typed ("(11) 91234-5678"); wa.me wants country code + digits. */
export function whatsappLink(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const full = digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
  return `https://wa.me/${full}`;
}

export function telLink(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 8 ? `tel:${digits}` : null;
}
