/** Normalize numeric fields from invoice OCR (handles commas / string numbers). */
function ocrNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/,/g, '').trim();
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export type ResolvedOcrPurchaseLine = {
  unitCost: number;
  lineTotal: number;
  quantity: number;
};

/**
 * Derives unit purchase cost for inventory receipt.
 * Prefer unitCost; if only line total is present, divide by quantity.
 */
export function resolveOcrPurchaseLine(item: Record<string, unknown>): ResolvedOcrPurchaseLine {
  const quantityRaw = ocrNumber(item.quantity);
  const quantity = Math.max(1, quantityRaw != null ? Math.round(quantityRaw) : 1);

  let unitCost = ocrNumber(item.unitCost);
  const lineTotalRaw =
    ocrNumber(item.lineTotal) ??
    ocrNumber(item.line_total) ??
    ocrNumber(item.total);

  if (unitCost == null) {
    const legacyCost = ocrNumber(item.cost);
    if (lineTotalRaw != null && quantity > 0) {
      if (legacyCost != null && Math.abs(legacyCost - lineTotalRaw) < 0.01) {
        unitCost = lineTotalRaw / quantity;
      } else if (legacyCost != null) {
        unitCost = legacyCost;
      } else {
        unitCost = lineTotalRaw / quantity;
      }
    } else if (legacyCost != null) {
      unitCost = legacyCost;
    }
  }

  if (unitCost == null) unitCost = 0;

  const lineTotal =
    lineTotalRaw != null ? lineTotalRaw : Math.round(unitCost * quantity * 100) / 100;

  return { unitCost, lineTotal, quantity };
}
