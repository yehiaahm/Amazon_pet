import { beforeEach, describe, expect, it } from 'vitest';
import { useCartStore, MAX_POS_DISCOUNT_PERCENT } from '../cartStore';

interface TestItemOverrides {
  itemId?: string;
  type?: 'PRODUCT' | 'SERVICE';
  name?: string;
  price?: number;
  cost?: number;
  listPrice?: number;
  maxStock?: number;
  stockQuantity?: number;
}

function baseItem(overrides: TestItemOverrides = {}) {
  return {
    itemId: 'v-1',
    type: 'PRODUCT' as const,
    name: 'Test Product',
    price: 100,
    cost: 60,
    ...overrides,
  };
}

describe('cartStore', () => {
  beforeEach(() => {
    useCartStore.getState().clearCart();
  });

  describe('addItem', () => {
    it('adds a new line item with quantity 1', () => {
      useCartStore.getState().addItem(baseItem());
      const items = useCartStore.getState().cartItems;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ itemId: 'v-1', quantity: 1, price: 100 });
    });

    it('increments quantity when the same item/type is added again', () => {
      useCartStore.getState().addItem(baseItem());
      useCartStore.getState().addItem(baseItem());
      const items = useCartStore.getState().cartItems;
      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(2);
    });

    it('treats the same itemId with a different type as a separate line', () => {
      useCartStore.getState().addItem(baseItem({ type: 'PRODUCT' }));
      useCartStore.getState().addItem(baseItem({ type: 'SERVICE' }));
      expect(useCartStore.getState().cartItems).toHaveLength(2);
    });

    it('refuses to add a line once stock is exhausted', () => {
      useCartStore.getState().addItem(baseItem({ stockQuantity: 0 }));
      expect(useCartStore.getState().cartItems).toHaveLength(0);
    });

    it('refuses to increment past maxStock', () => {
      useCartStore.getState().addItem(baseItem({ maxStock: 1 }));
      useCartStore.getState().addItem(baseItem({ maxStock: 1 }));
      const items = useCartStore.getState().cartItems;
      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(1);
    });
  });

  describe('updateQuantity', () => {
    it('clamps quantity to at least 1', () => {
      useCartStore.getState().addItem(baseItem());
      useCartStore.getState().updateQuantity('v-1', 'PRODUCT', -5);
      expect(useCartStore.getState().cartItems[0].quantity).toBe(1);
    });

    it('clamps quantity to available stock', () => {
      useCartStore.getState().addItem(baseItem({ stockQuantity: 5 }));
      useCartStore.getState().updateQuantity('v-1', 'PRODUCT', 999);
      expect(useCartStore.getState().cartItems[0].quantity).toBe(5);
    });
  });

  describe('updateUnitPrice', () => {
    it('never charges less than 0.01', () => {
      useCartStore.getState().addItem(baseItem({ price: 100 }));
      useCartStore.getState().updateUnitPrice('v-1', 'PRODUCT', -10);
      expect(useCartStore.getState().cartItems[0].price).toBe(0.01);
    });

    it('flags a line as below-minimum without manager approval', () => {
      // listPrice 100 -> minAllowedSalePrice = 80 (20% max discount)
      useCartStore.getState().addItem(baseItem({ price: 100, listPrice: 100 }));
      useCartStore.getState().updateUnitPrice('v-1', 'PRODUCT', 50);
      const line = useCartStore.getState().cartItems[0];
      expect(line.price).toBe(50);
      expect(line.priceBelowMinApproved).toBe(false);
      expect(useCartStore.getState().getUnapprovedBelowMinLines()).toHaveLength(1);
    });

    it('accepts a below-minimum price once manager-approved', () => {
      useCartStore.getState().addItem(baseItem({ price: 100, listPrice: 100 }));
      useCartStore.getState().updateUnitPrice('v-1', 'PRODUCT', 50, { belowMinApproved: true });
      expect(useCartStore.getState().getUnapprovedBelowMinLines()).toHaveLength(0);
    });

    it('does not flag a price at or above the minimum', () => {
      useCartStore.getState().addItem(baseItem({ price: 100, listPrice: 100 }));
      useCartStore.getState().updateUnitPrice('v-1', 'PRODUCT', 85);
      expect(useCartStore.getState().getUnapprovedBelowMinLines()).toHaveLength(0);
    });
  });

  describe('setDiscountPercent', () => {
    it('clamps negative percentages to 0', () => {
      useCartStore.getState().setDiscountPercent(-20);
      expect(useCartStore.getState().discountPercent).toBe(0);
    });

    it('clamps percentages above the cap', () => {
      useCartStore.getState().setDiscountPercent(999);
      expect(useCartStore.getState().discountPercent).toBe(MAX_POS_DISCOUNT_PERCENT);
    });
  });

  describe('getTotals', () => {
    it('sums subtotal across all lines', () => {
      useCartStore.getState().addItem(baseItem({ itemId: 'v-1', price: 100 }));
      useCartStore.getState().addItem(baseItem({ itemId: 'v-2', price: 50 }));
      expect(useCartStore.getState().getTotals().subtotal).toBe(150);
    });

    it('applies manual discount percent to the subtotal', () => {
      useCartStore.getState().addItem(baseItem({ price: 100 }));
      useCartStore.getState().setDiscountPercent(10);
      const totals = useCartStore.getState().getTotals();
      expect(totals.manualDiscount).toBe(10);
      expect(totals.total).toBe(90);
    });

    it('combines loyalty and manual discounts but never exceeds the subtotal', () => {
      useCartStore.getState().addItem(baseItem({ price: 100 }));
      useCartStore.getState().setDiscountPercent(10);
      useCartStore.getState().setLoyaltyPercent(95);
      const totals = useCartStore.getState().getTotals();
      expect(totals.discount).toBe(100);
      expect(totals.total).toBe(0);
    });
  });

  describe('clearCart', () => {
    it('resets items, discount, loyalty and payment method', () => {
      useCartStore.getState().addItem(baseItem());
      useCartStore.getState().setDiscountPercent(5);
      useCartStore.getState().setLoyaltyPercent(5);
      useCartStore.getState().setPaymentMethod('CARD');

      useCartStore.getState().clearCart();

      const state = useCartStore.getState();
      expect(state.cartItems).toHaveLength(0);
      expect(state.discountPercent).toBe(0);
      expect(state.loyaltyPercent).toBe(0);
      expect(state.paymentMethod).toBe('CASH');
    });
  });
});
