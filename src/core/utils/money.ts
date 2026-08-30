/** Egyptian Pound — system display currency (not USD). */
export const CURRENCY_CODE = 'EGP';
export const CURRENCY_LABEL = 'ج.م';

/**
 * Format an amount for UI: `1,250.00 ج.م`
 * Use for all money shown to users.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  opts?: { signed?: boolean; digits?: number }
): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  const value = Number.isFinite(n) ? n : 0;
  const digits = opts?.digits ?? 2;
  const formatted = Math.abs(value).toLocaleString('en-EG', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const sign = value < 0 ? '-' : opts?.signed && value > 0 ? '+' : '';
  return `${sign}${formatted} ${CURRENCY_LABEL}`;
}
