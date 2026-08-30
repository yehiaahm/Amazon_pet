/** One POS sell line per SKU when legacy duplicates exist in DB. */
export type PosCatalogLine = {
  id: string;
  name: string;
  price: number;
  cost: number;
  type: 'PRODUCT' | 'SERVICE';
  stock: number | null;
  sku: string;
  barcode?: string;
};

export function pickPreferredCatalogLine(a: PosCatalogLine, b: PosCatalogLine): PosCatalogLine {
  const stockA = a.stock ?? 0;
  const stockB = b.stock ?? 0;
  const preferred = stockB > stockA ? b : a;
  return {
    ...preferred,
    barcode: preferred.barcode || a.barcode || b.barcode,
  };
}

export function dedupeProductLinesBySku(lines: PosCatalogLine[]): PosCatalogLine[] {
  const passthrough: PosCatalogLine[] = [];
  const bySku = new Map<string, PosCatalogLine>();

  for (const line of lines) {
    if (line.type !== 'PRODUCT') {
      passthrough.push(line);
      continue;
    }
    const key = (line.sku || '').trim().toLowerCase();
    if (!key) {
      passthrough.push(line);
      continue;
    }
    const prev = bySku.get(key);
    bySku.set(key, prev ? pickPreferredCatalogLine(prev, line) : line);
  }

  return [...passthrough, ...bySku.values()];
}

/** Collapse legacy duplicate products (same display name, different auto SKUs). */
export function dedupeProductLinesForPos(lines: PosCatalogLine[]): PosCatalogLine[] {
  const passthrough = lines.filter((l) => l.type !== 'PRODUCT');
  const productsOnly = dedupeProductLinesBySku(lines.filter((l) => l.type === 'PRODUCT'));
  const byName = new Map<string, PosCatalogLine>();
  for (const line of productsOnly) {
    const nameKey = line.name.trim().toLowerCase();
    const prev = byName.get(nameKey);
    byName.set(nameKey, prev ? pickPreferredCatalogLine(prev, line) : line);
  }
  return [...passthrough, ...byName.values()];
}
