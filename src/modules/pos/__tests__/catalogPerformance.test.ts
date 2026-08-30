import { describe, it, expect } from 'vitest';
import type { PosCatalogLine } from '../../../core/pos/catalogDedupe';
import { filterCatalogItems, buildBaseCatalogItems, buildProductByIdMap } from '../buildPosCatalog';
import type { Product, ProductVariant } from '../../../types/erp';

function mockCatalog(size: number): PosCatalogLine[] {
  const variants: ProductVariant[] = [];
  const products: Product[] = [];
  for (let i = 0; i < size; i++) {
    const pid = `p-${i}`;
    products.push({
      id: pid,
      sku: `SKU-${i}`,
      name: `Product ${i}`,
      categoryId: 'c-1',
      brandId: 'b-1',
      unitId: 'u-1',
      minStockLimit: 5,
    });
    variants.push({
      id: `v-${i}`,
      productId: pid,
      name: 'Standard',
      price: 10 + (i % 100),
      cost: 5,
      stockQuantity: 20,
      barcode: `BC${i}`,
    });
  }
  return buildBaseCatalogItems(variants, buildProductByIdMap(products), [], 'PRODUCTS');
}

describe('POS catalog performance', () => {
  it('filters 100k items under 200ms', () => {
    const items = mockCatalog(100_000);
    const start = performance.now();
    const filtered = filterCatalogItems(items, 'Product 999');
    const elapsed = performance.now() - start;
    expect(filtered.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(200);
  });

  it('builds 50k variant catalog under 500ms', () => {
    const variants: ProductVariant[] = [];
    const products: Product[] = [];
    for (let i = 0; i < 50_000; i++) {
      const pid = `p-${i}`;
      products.push({
        id: pid,
        sku: `SKU-${i}`,
        name: `Item ${i}`,
        categoryId: 'c-1',
        brandId: 'b-1',
        unitId: 'u-1',
        minStockLimit: 1,
      });
      variants.push({
        id: `v-${i}`,
        productId: pid,
        name: 'Std',
        price: 10,
        cost: 5,
        stockQuantity: 1,
      });
    }
    const map = buildProductByIdMap(products);
    const start = performance.now();
    const built = buildBaseCatalogItems(variants, map, [], 'PRODUCTS');
    const elapsed = performance.now() - start;
    expect(built.length).toBe(50_000);
    expect(elapsed).toBeLessThan(500);
  });
});
