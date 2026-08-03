import { create } from 'zustand';
import { SaleItem } from '../../types/erp';
import {
  isBelowMinAllowedSalePrice,
  minAllowedSalePrice,
} from '../pos/priceOverride';

/** Cashier manual discount on a bill cannot exceed this percent of subtotal. */
export const MAX_POS_DISCOUNT_PERCENT = 10;

type CartLineInput = Omit<SaleItem, 'quantity' | 'id'> & {
  maxStock?: number;
  stockQuantity?: number;
  listPrice?: number;
};

interface CartState {
  cartItems: SaleItem[];
  customerId: string;
  /** Manual discount percent applied by cashier (0–MAX_POS_DISCOUNT_PERCENT). */
  discountPercent: number;
  loyaltyPercent: number;
  paymentMethod: 'CASH' | 'CARD' | 'MOBILE';
  /** Manager PIN captured when approving a below-minimum line price (cashier). */
  belowMinManagerPassword: string;

  addItem: (item: CartLineInput) => void;
  removeItem: (itemId: string, type: SaleItem['type']) => void;
  updateQuantity: (itemId: string, type: SaleItem['type'], quantity: number) => void;
  /** Temporary unit price for this bill only — may be above or below catalog. */
  updateUnitPrice: (
    itemId: string,
    type: SaleItem['type'],
    unitPrice: number,
    opts?: { belowMinApproved?: boolean }
  ) => void;
  setCustomerId: (customerId: string) => void;
  setDiscountPercent: (percent: number) => void;
  setLoyaltyPercent: (loyaltyPercent: number) => void;
  setPaymentMethod: (method: 'CASH' | 'CARD' | 'MOBILE') => void;
  setBelowMinManagerPassword: (password: string) => void;
  clearCart: () => void;
  getUnapprovedBelowMinLines: () => SaleItem[];
  minAllowedPriceForLine: (itemId: string, type: SaleItem['type']) => number;
  getTotals: () => {
    subtotal: number;
    tax: number;
    discount: number;
    loyaltyDiscount: number;
    manualDiscount: number;
    discountPercent: number;
    total: number;
  };
}

function resolveMaxStock(item: {
  maxStock?: number;
  stockQuantity?: number;
}): number | undefined {
  if (typeof item.maxStock === 'number' && Number.isFinite(item.maxStock)) {
    return item.maxStock;
  }
  if (typeof item.stockQuantity === 'number' && Number.isFinite(item.stockQuantity)) {
    return item.stockQuantity;
  }
  return undefined;
}

function clampDiscountPercent(percent: number): number {
  if (!Number.isFinite(percent) || percent < 0) return 0;
  return Math.min(MAX_POS_DISCOUNT_PERCENT, percent);
}

export const useCartStore = create<CartState>((set, get) => ({
  cartItems: [],
  customerId: '',
  discountPercent: 0,
  loyaltyPercent: 0,
  paymentMethod: 'CASH',
  belowMinManagerPassword: '',

  addItem: (item) =>
    set((state) => {
      const maxStock = resolveMaxStock(item);
      const stockQuantity =
        typeof item.stockQuantity === 'number' ? item.stockQuantity : maxStock;
      const listPrice =
        typeof item.listPrice === 'number' && Number.isFinite(item.listPrice)
          ? item.listPrice
          : item.price;

      const existing = state.cartItems.find(
        (i) => i.itemId === item.itemId && i.type === item.type
      );

      if (existing) {
        const nextQty = existing.quantity + 1;
        if (maxStock !== undefined && nextQty > maxStock) {
          return state;
        }
        return {
          cartItems: state.cartItems.map((i) =>
            i.itemId === item.itemId && i.type === item.type
              ? {
                  ...i,
                  quantity: nextQty,
                  ...(stockQuantity !== undefined ? { stockQuantity } : {}),
                }
              : i
          ),
        };
      }

      if (maxStock !== undefined && maxStock < 1) {
        return state;
      }

      const { maxStock: _ms, ...rest } = item;
      return {
        cartItems: [
          ...state.cartItems,
          {
            ...rest,
            price: item.price,
            listPrice,
            quantity: 1,
            id: `item-${Date.now()}`,
            priceBelowMinApproved: false,
            ...(stockQuantity !== undefined ? { stockQuantity } : {}),
          },
        ],
      };
    }),

  removeItem: (itemId, type) =>
    set((state) => ({
      cartItems: state.cartItems.filter((i) => !(i.itemId === itemId && i.type === type)),
    })),

  updateQuantity: (itemId, type, quantity) =>
    set((state) => ({
      cartItems: state.cartItems.map((i) => {
        if (!(i.itemId === itemId && i.type === type)) return i;
        const maxStock = resolveMaxStock(i);
        let next = Math.max(1, quantity);
        if (maxStock !== undefined) {
          next = Math.min(next, maxStock);
        }
        return { ...i, quantity: next };
      }),
    })),

  updateUnitPrice: (itemId, type, unitPrice, opts) =>
    set((state) => ({
      cartItems: state.cartItems.map((i) => {
        if (!(i.itemId === itemId && i.type === type)) return i;
        const listPrice = typeof i.listPrice === 'number' ? i.listPrice : i.price;
        const fallback = listPrice;
        const next = Number.isFinite(unitPrice) ? unitPrice : fallback;
        const charged = Math.max(0.01, next);
        const belowMin = isBelowMinAllowedSalePrice(charged, listPrice);
        const belowMinApproved = opts?.belowMinApproved === true
          || (!belowMin && i.priceBelowMinApproved);
        return {
          ...i,
          price: charged,
          priceBelowMinApproved: belowMin ? belowMinApproved : false,
        };
      }),
    })),

  getUnapprovedBelowMinLines: () => {
    const items = get().cartItems;
    return items.filter((i) => {
      const listPrice = i.listPrice ?? i.price;
      return isBelowMinAllowedSalePrice(i.price, listPrice) && !i.priceBelowMinApproved;
    });
  },

  minAllowedPriceForLine: (itemId, type) => {
    const item = get().cartItems.find((i) => i.itemId === itemId && i.type === type);
    if (!item) return 0.01;
    return minAllowedSalePrice(item.listPrice ?? item.price);
  },

  setCustomerId: (customerId) => set({ customerId }),
  setDiscountPercent: (percent) => set({ discountPercent: clampDiscountPercent(percent) }),
  setLoyaltyPercent: (loyaltyPercent) => set({ loyaltyPercent }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setBelowMinManagerPassword: (password) => set({ belowMinManagerPassword: password }),
  clearCart: () =>
    set({
      cartItems: [],
      customerId: '',
      discountPercent: 0,
      loyaltyPercent: 0,
      paymentMethod: 'CASH',
      belowMinManagerPassword: '',
    }),

  getTotals: () => {
    const items = get().cartItems;
    const discountPercent = clampDiscountPercent(get().discountPercent);
    const loyaltyPercent = get().loyaltyPercent;
    const subtotal = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const loyaltyDiscount = subtotal * (loyaltyPercent / 100);
    const manualDiscount = subtotal * (discountPercent / 100);
    const discount = Math.min(subtotal, loyaltyDiscount + manualDiscount);
    const tax = 0;
    const total = Math.max(0, subtotal - discount) + tax;

    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      discount: parseFloat(discount.toFixed(2)),
      loyaltyDiscount: parseFloat(loyaltyDiscount.toFixed(2)),
      manualDiscount: parseFloat(manualDiscount.toFixed(2)),
      discountPercent,
      total: parseFloat(total.toFixed(2)),
    };
  },
}));
