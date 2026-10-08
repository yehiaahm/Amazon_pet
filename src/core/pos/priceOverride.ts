/** Cashier may lower unit price by at most this percent vs catalog/list price. */
export const MAX_POS_PRICE_DISCOUNT_PERCENT = 20;

export function minAllowedSalePrice(listPrice: number): number {
  if (!Number.isFinite(listPrice) || listPrice <= 0) return 0.01;
  return parseFloat((listPrice * (1 - MAX_POS_PRICE_DISCOUNT_PERCENT / 100)).toFixed(2));
}

export function isBelowMinAllowedSalePrice(charged: number, listPrice: number): boolean {
  return charged < minAllowedSalePrice(listPrice) - 0.001;
}

/** Rounds to 2 decimals half-up, like the backend's BigDecimal HALF_UP. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function clampLineDiscountPercent(percent: number | undefined): number {
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0) return 0;
  return Math.min(100, percent);
}

/** Unit price actually charged after the per-line discount percent. */
export function lineNetUnitPrice(price: number, discountPercent?: number): number {
  const pct = clampLineDiscountPercent(discountPercent);
  if (pct === 0) return price;
  return roundMoney((price * (100 - pct)) / 100);
}

export function priceAdjustmentDelta(charged: number, listPrice: number): number {
  return parseFloat((charged - listPrice).toFixed(2));
}

export function formatPriceAdjustment(charged: number, listPrice: number): string {
  const delta = priceAdjustmentDelta(charged, listPrice);
  if (Math.abs(delta) < 0.001) return '';
  if (delta > 0) return `+${delta.toFixed(2)}`;
  return delta.toFixed(2);
}
