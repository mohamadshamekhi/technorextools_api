/**
 * Normalise any accepted Iranian mobile spelling to canonical `+989xxxxxxxxx`.
 * Input is already shape-validated by `mobileSchema`.
 */
export function normalizeMobile(raw: string): string {
  const digits = raw.trim().replace(/[^\d]/g, '');
  const local = digits.replace(/^(0098|98|0)/, ''); // strip country/trunk prefix → 9xxxxxxxxx
  return `+98${local}`;
}
