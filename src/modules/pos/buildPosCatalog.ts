import type { Product, ProductVariant, Service } from '../../types/erp';
import {
  dedupeProductLinesForPos,
  type PosCatalogLine,
} from '../../core/pos/catalogDedupe';

export type PosCatalogTab = 'ALL' | 'PRODUCTS' | 'SERVICES' | 'INVOICES';

export function buildProductByIdMap(products: Product[] | undefined): Map<string, Product> {
  const map = new Map<string, Product>();
  if (!products) return map;
  for (const p of products) {
    map.set(p.id, p);
  }
  return map;
}

/** Build catalog lines for display (category tab only — no search filter). */
export function buildBaseCatalogItems(
  variants: ProductVariant[] | undefined,
  productById: Map<string, Product>,
  services: Service[] | undefined,
  selectedCategory: PosCatalogTab
): PosCatalogLine[] {
  const list: PosCatalogLine[] = [];

  if (selectedCategory === 'ALL' || selectedCategory === 'PRODUCTS') {
    if (variants) {
      for (const v of variants) {
        const prod = productById.get(v.productId);
        if (!prod) continue;
        const displayName =
          prod.name && v.name && prod.name !== v.name
            ? `${prod.name} (${v.name})`
            : prod.name || v.name;
        list.push({
          id: v.id,
          name: displayName,
          price: v.price,
          cost: v.cost,
          type: 'PRODUCT',
          stock: v.stockQuantity,
          sku: prod.sku,
          barcode: v.barcode,
        });
      }
    }
  }

  if (selectedCategory === 'ALL' || selectedCategory === 'SERVICES') {
    if (services) {
      for (const s of services) {
        list.push({
          id: s.id,
          name: `${s.name} (${s.durationMinutes} min)`,
          price: s.price,
          cost: 0,
          type: 'SERVICE',
          stock: null,
          sku: 'SRV-JOB',
        });
      }
    }
  }

  return dedupeProductLinesForPos(list);
}

export function filterCatalogItems(items: PosCatalogLine[], query: string): PosCatalogLine[] {
  const trimmed = query.trim();
  if (!trimmed) return items;
  const q = trimmed.toLowerCase();
  const result: PosCatalogLine[] = [];
  for (const item of items) {
    if (
      item.name.toLowerCase().includes(q) ||
      item.sku.toLowerCase().includes(q) ||
      (item.barcode && item.barcode.toLowerCase().includes(q))
    ) {
      result.push(item);
    }
  }
  return result;
}

/** Scan/voice catalog — products only, deduped by SKU. */
export function buildScanCatalogItems(
  variants: ProductVariant[] | undefined,
  productById: Map<string, Product>
): PosCatalogLine[] {
  const raw: PosCatalogLine[] = [];
  if (!variants) return [];
  for (const v of variants) {
    const prod = productById.get(v.productId);
    if (!prod?.sku) continue;
    raw.push({
      id: v.id,
      name: `${prod.name} (${v.name})`,
      price: v.price,
      cost: v.cost,
      type: 'PRODUCT',
      stock: v.stockQuantity,
      sku: prod.sku,
      barcode: v.barcode,
    });
  }
  return dedupeProductLinesForPos(raw);
}
