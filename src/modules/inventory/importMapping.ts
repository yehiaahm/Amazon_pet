export const AUTO_MAP_DICTIONARY: Record<string, string[]> = {
  sku: ['sku', 'code', 'كود', 'رقم المنتج', 'الباركود', 'barcode', 'item code', 'كود السلعة'],
  productName: ['product', 'name', 'الاسم', 'اسم المنتج', 'العنصر', 'اسم السلعة'],
  variantName: ['variant', 'size', 'الصنف', 'الحجم', 'الوزن', 'المقاس'],
  cost: ['cost', 'سعر الشراء', 'التكلفة', 'سعر التكلفة', 'شراء'],
  price: ['price', 'selling price', 'سعر البيع', 'السعر', 'بيع'],
  stock: ['stock', 'qty', 'الكمية', 'المخزون', 'الرصيد', 'كمية الجرد'],
  categoryName: ['category', 'الفئة', 'القسم', 'التصنيف'],
  brand: ['brand', 'الماركة', 'الشركة', 'براند'],
  supplier: ['supplier', 'المورد', 'تاجر'],
  expiryDate: ['expiry', 'exp', 'expiry date', 'تاريخ الانتهاء', 'انتهاء', 'صلاحية', 'expiration'],
};

export const IMPORT_FIELD_KEYS = [
  'sku', 'productName', 'variantName', 'cost', 'price', 'stock',
  'categoryName', 'brand', 'supplier', 'expiryDate',
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELD_KEYS)[number];

export function emptyImportMappings(): Record<ImportFieldKey, string> {
  return {
    sku: '',
    productName: '',
    variantName: '',
    cost: '',
    price: '',
    stock: '',
    categoryName: '',
    brand: '',
    supplier: '',
    expiryDate: '',
  };
}

export function normalizeImportHeader(str: unknown): string {
  if (str === null || str === undefined) return '';
  let s = String(str).toLowerCase().trim();
  s = s.replace(/^(الـ|ال)/, '');
  return s
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ـ]/g, '')
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9\u0627-\u064a]/g, '');
}

export function autoMapImportColumns(
  headers: string[],
  existing?: Partial<Record<ImportFieldKey, string>>
): Record<ImportFieldKey, string> {
  const autoMappings = { ...emptyImportMappings(), ...existing };
  const mappedHeaders = new Set<string>(
    Object.values(autoMappings).filter(Boolean)
  );

  for (const field of IMPORT_FIELD_KEYS) {
    const matchedHeader = headers.find((h) => {
      const normH = normalizeImportHeader(h);
      return AUTO_MAP_DICTIONARY[field].some(
        (synonym) => normalizeImportHeader(synonym) === normH
      );
    });
    if (matchedHeader) {
      autoMappings[field] = matchedHeader;
      mappedHeaders.add(matchedHeader);
    }
  }

  for (const field of IMPORT_FIELD_KEYS) {
    if (autoMappings[field]) continue;
    const matchedHeader = headers.find((h) => {
      if (mappedHeaders.has(h)) return false;
      const normH = normalizeImportHeader(h);
      return AUTO_MAP_DICTIONARY[field].some((synonym) => {
        const normSyn = normalizeImportHeader(synonym);
        return normSyn.length > 2 && (normH.includes(normSyn) || normSyn.includes(normH));
      });
    });
    if (matchedHeader) {
      autoMappings[field] = matchedHeader;
      mappedHeaders.add(matchedHeader);
    }
  }

  return autoMappings;
}

export function normalizeExpiryDate(raw: unknown): string | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined;
  if (typeof raw === 'number' && raw > 40000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    excelEpoch.setUTCDate(excelEpoch.getUTCDate() + Math.floor(raw));
    return excelEpoch.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return undefined;
}
