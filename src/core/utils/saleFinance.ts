import type { Sale, SaleItem } from '../../types/erp';

/** Local calendar day key YYYY-MM-DD (avoids UTC shift from toISOString). */
export function saleDateKey(date: string | undefined): string {
  if (!date) return '';
  return date.split('T')[0];
}

/** Net sold quantity on a line after partial returns. */
export function saleLineNetQuantity(
  item: Pick<SaleItem, 'quantity' | 'quantityReturned'>
): number {
  const q = Number(item.quantity) || 0;
  const r = Number(item.quantityReturned) || 0;
  return Math.max(0, q - r);
}

/** Returnable product quantity (for refund UI). */
export function saleLineReturnableQuantity(
  item: Pick<SaleItem, 'quantity' | 'quantityReturned' | 'type'>
): number {
  if (item.type && item.type !== 'PRODUCT') return 0;
  return saleLineNetQuantity(item);
}

/**
 * Sales that still contribute to net revenue (includes partial refunds).
 * Fully refunded invoices are excluded.
 */
export function isCompletedSale(sale: { status?: string }): boolean {
  const st = sale.status || 'COMPLETED';
  return st === 'COMPLETED' || st === 'PARTIALLY_REFUNDED';
}

export function isFullyRefundedSale(sale: { status?: string }): boolean {
  return sale.status === 'REFUNDED';
}

export function saleStatusLabel(status?: string): string {
  switch (status) {
    case 'REFUNDED':
      return 'مرتجعة بالكامل';
    case 'PARTIALLY_REFUNDED':
      return 'مرتجع جزئي';
    case 'COMPLETED':
    default:
      return 'مكتملة';
  }
}

export function saleStatusBadgeVariant(
  status?: string
): 'success' | 'warning' | 'danger' | 'gray' {
  switch (status) {
    case 'REFUNDED':
      return 'danger';
    case 'PARTIALLY_REFUNDED':
      return 'warning';
    case 'COMPLETED':
    default:
      return 'success';
  }
}

function grossLineSubtotal(
  items: Array<Pick<SaleItem, 'price' | 'quantity'>>
): number {
  return items.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
    0
  );
}

/**
 * Sales revenue (no tax): net line totals − proportional discount.
 */
export function saleRevenue(sale: {
  status?: string;
  totalAmount?: number;
  tax?: number;
  discount?: number;
  items?: Array<Pick<SaleItem, 'price' | 'quantity' | 'quantityReturned' | 'type'>>;
}): number {
  if (isFullyRefundedSale(sale)) return 0;

  const items = sale.items;
  if (items && items.length > 0) {
    const netSubtotal = items.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * saleLineNetQuantity(item),
      0
    );
    const grossSubtotal = grossLineSubtotal(items);
    const disc = Number(sale.discount) || 0;
    const netDiscount =
      grossSubtotal > 0 ? (disc * netSubtotal) / grossSubtotal : 0;
    return Math.max(0, netSubtotal - netDiscount);
  }

  if (sale.status === 'PARTIALLY_REFUNDED') {
    return Math.max(0, (Number(sale.totalAmount) || 0) - (Number(sale.tax) || 0));
  }

  return Math.max(0, (Number(sale.totalAmount) || 0) - (Number(sale.tax) || 0));
}

/** Cost of goods sold — products only; prefers FIFO snapshot {@code cogs} (already net after returns). */
export function saleCogs(sale: {
  status?: string;
  items?: Array<
    Pick<SaleItem, 'cost' | 'quantity' | 'quantityReturned' | 'cogs' | 'type'>
  >;
}): number {
  if (isFullyRefundedSale(sale)) return 0;

  return (sale.items || [])
    .filter((item) => !item.type || item.type === 'PRODUCT')
    .reduce((sum, item) => {
      const snap = Number((item as { cogs?: number }).cogs);
      if (Number.isFinite(snap) && snap >= 0) {
        return sum + snap;
      }
      return (
        sum +
        (Number(item.cost) || 0) * saleLineNetQuantity(item)
      );
    }, 0);
}

export function saleGrossProfit(sale: {
  status?: string;
  totalAmount?: number;
  tax?: number;
  discount?: number;
  items?: Array<
    Pick<SaleItem, 'price' | 'quantity' | 'quantityReturned' | 'type' | 'cost' | 'cogs'>
  >;
}): number {
  return saleRevenue(sale) - saleCogs(sale);
}

export function sumSaleRevenue(sales: Sale[]): number {
  return sales.filter(isCompletedSale).reduce((sum, s) => sum + saleRevenue(s), 0);
}

export function sumSaleCogs(sales: Sale[]): number {
  return sales.filter(isCompletedSale).reduce((sum, s) => sum + saleCogs(s), 0);
}

export function sumSaleGrossProfit(sales: Sale[]): number {
  return sumSaleRevenue(sales) - sumSaleCogs(sales);
}
