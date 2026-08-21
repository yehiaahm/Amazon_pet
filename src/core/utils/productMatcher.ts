import type { Product, ProductVariant } from '../../types/erp';

export type MatchStatus = 'MATCHED_BARCODE' | 'MATCHED_SKU' | 'MATCHED_ALIAS' | 'MATCHED_FUZZY' | 'UNMATCHED';

export type ProductMatchResult = {
  status: MatchStatus;
  matchedProduct?: Product;
  matchedVariant?: ProductVariant;
  confidenceScore: number; // 0.0 to 1.0
  matchLabelAr: string;
};

/** Normalize string for comparison: removes diacritics, spaces, punctuation, standardizes Arabic characters. */
export function normalizeString(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ـ/g, '')
    .replace(/[^\w\s\u0600-\u06FF]/g, '')
    .replace(/\s+/g, ' ');
}

/** Levenshtein distance between two strings */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/** Calculate similarity score between 0.0 and 1.0 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;

  // Check sub-string inclusion
  if (s1.includes(s2) || s2.includes(s1)) {
    const lenRatio = Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
    if (lenRatio > 0.6) return 0.88;
  }

  // Token set similarity (Word overlap)
  const tokens1 = new Set(s1.split(' '));
  const tokens2 = new Set(s2.split(' '));
  let commonTokens = 0;
  tokens1.forEach((t) => {
    if (tokens2.has(t) && t.length > 1) commonTokens++;
  });
  const maxTokens = Math.max(tokens1.size, tokens2.size);
  const tokenScore = maxTokens > 0 ? commonTokens / maxTokens : 0;

  // Levenshtein ratio
  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  const levScore = maxLength > 0 ? 1 - distance / maxLength : 0;

  return Math.round((tokenScore * 0.5 + levScore * 0.5) * 100) / 100;
}

/** Local Storage Supplier Memory Helper */
const SUPPLIER_ALIAS_KEY = 'amazon_pet_supplier_aliases';

export function getSupplierAliases(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SUPPLIER_ALIAS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveSupplierAlias(supplierName: string, rawItemName: string, matchedSku: string): void {
  try {
    const key = `${normalizeString(supplierName)}:::${normalizeString(rawItemName)}`;
    const aliases = getSupplierAliases();
    aliases[key] = matchedSku;
    localStorage.setItem(SUPPLIER_ALIAS_KEY, JSON.stringify(aliases));
  } catch {
    // Ignore localStorage quota errors
  }
}

/** Multi-Step Product Matcher Engine */
export function matchProductInCatalog(
  rawItem: { productName: string; barcode?: string; sku?: string },
  products: Product[],
  variants: ProductVariant[],
  supplierName?: string
): ProductMatchResult {
  const barcode = (rawItem.barcode || rawItem.sku || '').trim().toLowerCase();
  const sku = (rawItem.sku || '').trim().toLowerCase();
  const name = rawItem.productName.trim();

  // Step 1: Barcode Match
  if (barcode && barcode.length >= 4) {
    const matchedProduct = products.find(
      (p) => p.sku && p.sku.trim().toLowerCase() === barcode
    );
    if (matchedProduct) {
      const variant = variants.find((v) => v.productId === matchedProduct.id);
      return {
        status: 'MATCHED_BARCODE',
        matchedProduct,
        matchedVariant: variant,
        confidenceScore: 1.0,
        matchLabelAr: 'مطابق بالباركود (100%)',
      };
    }
  }

  // Step 2: SKU Match
  if (sku && sku.length >= 3) {
    const matchedProduct = products.find(
      (p) => p.sku && p.sku.trim().toLowerCase() === sku
    );
    if (matchedProduct) {
      const variant = variants.find((v) => v.productId === matchedProduct.id);
      return {
        status: 'MATCHED_SKU',
        matchedProduct,
        matchedVariant: variant,
        confidenceScore: 1.0,
        matchLabelAr: 'مطابق بـ SKU (100%)',
      };
    }
  }

  // Step 3: Supplier Memory Alias Match
  if (supplierName && name) {
    const aliases = getSupplierAliases();
    const aliasKey = `${normalizeString(supplierName)}:::${normalizeString(name)}`;
    const mappedSku = aliases[aliasKey];
    if (mappedSku) {
      const matchedProduct = products.find(
        (p) => p.sku && p.sku.trim().toLowerCase() === mappedSku.toLowerCase()
      );
      if (matchedProduct) {
        const variant = variants.find((v) => v.productId === matchedProduct.id);
        return {
          status: 'MATCHED_ALIAS',
          matchedProduct,
          matchedVariant: variant,
          confidenceScore: 0.95,
          matchLabelAr: 'مطابق بذاكرة المورد (95%)',
        };
      }
    }
  }

  // Step 4: Fuzzy Name Match
  if (name) {
    let bestProduct: Product | undefined;
    let bestScore = 0;

    for (const p of products) {
      const score = calculateSimilarity(name, p.name);
      if (score > bestScore) {
        bestScore = score;
        bestProduct = p;
      }
    }

    if (bestProduct && bestScore >= 0.65) {
      const variant = variants.find((v) => v.productId === bestProduct!.id);
      return {
        status: 'MATCHED_FUZZY',
        matchedProduct: bestProduct,
        matchedVariant: variant,
        confidenceScore: bestScore,
        matchLabelAr: `مطابق بالاسم (${Math.round(bestScore * 100)}%)`,
      };
    }
  }

  return {
    status: 'UNMATCHED',
    confidenceScore: 0.0,
    matchLabelAr: 'منتج جديد (غير مسجّل بالكتالوج)',
  };
}
