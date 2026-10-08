import { create } from 'zustand';
import { SaleItem } from '../../types/erp';
import {
  clampLineDiscountPercent,
  isBelowMinAllowedSalePrice,
  lineNetUnitPrice,
  minAllowedSalePrice,
} from '../pos/priceOverride';

/** Cashier manual discount on a bill cannot exceed this percent of subtotal (the owner is exempt). */
export const MAX_POS_DISCOUNT_PERCENT = 10;

/** Bill-level manual discount entered as a percent of subtotal or as a fixed EGP amount. */
export type DiscountMode = 'PERCENT' | 'AMOUNT';

type CartLineInput = Omit<SaleItem, 'quantity' | 'id'> & {
  maxStock?: number;
  stockQuantity?: number;
  listPrice?: number;
};

export type PaymentMethod = 'CASH' | 'CARD' | 'MOBILE' | 'INSTAPAY' | 'VODAFONE_CASH';

export interface SplitPaymentLine {
  method: PaymentMethod;
  amount: number;
}

interface CartState {
  cartItems: SaleItem[];
  customerId: string;
  discountMode: DiscountMode;
  /** Manual discount percent (PERCENT mode), 0–MAX_POS_DISCOUNT_PERCENT unless discountUnlimited. */
  discountPercent: number;
  /** Manual discount in EGP (AMOUNT mode); capped in getTotals the same way as the percent. */
  discountAmount: number;
  /** True for the owner: the manual bill discount has no MAX_POS_DISCOUNT_PERCENT cap. */
  discountUnlimited: boolean;
  loyaltyPercent: number;
  /** Amount of the customer's loyalty balance the cashier chose to redeem on this bill. */
  loyaltyRedeemAmount: number;
  paymentMethod: PaymentMethod;
  /** When true, the total is paid across the two entries in splitPayments instead of paymentMethod. */
  isSplitPayment: boolean;
  /** Exactly two tenders (e.g. cash + card) when isSplitPayment is true; empty otherwise. */
  splitPayments: SplitPaymentLine[];
  /** Manager PIN captured when approving a below-minimum line price (cashier). */
  belowMinManagerPassword: string;
  isDelivery: boolean;
  /** Delivery fee entered by the cashier; only counted when isDelivery is true. */
  deliveryFee: number;
  /** Delivery address; auto-filled from the selected customer's saved address when available. */
  deliveryAddress: string;

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
  /** Per-line discount percent (0–100) applied on top of the line's unit price. */
  updateLineDiscount: (
    itemId: string,
    type: SaleItem['type'],
    percent: number,
    opts?: { belowMinApproved?: boolean }
  ) => void;
  setCustomerId: (customerId: string) => void;
  setDiscountMode: (mode: DiscountMode) => void;
  setDiscountPercent: (percent: number) => void;
  setDiscountAmount: (amount: number) => void;
  setDiscountUnlimited: (unlimited: boolean) => void;
  setLoyaltyPercent: (loyaltyPercent: number) => void;
  setLoyaltyRedeemAmount: (amount: number) => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setSplitPaymentEnabled: (enabled: boolean) => void;
  setSplitPaymentLine: (index: 0 | 1, patch: Partial<SplitPaymentLine>) => void;
  setBelowMinManagerPassword: (password: string) => void;
  setIsDelivery: (isDelivery: boolean) => void;
  setDeliveryFee: (fee: number) => void;
  setDeliveryAddress: (address: string) => void;
  clearCart: () => void;
  getUnapprovedBelowMinLines: () => SaleItem[];
  minAllowedPriceForLine: (itemId: string, type: SaleItem['type']) => number;
  getTotals: () => {
    /** Sum of net line totals (after per-line discounts). */
    subtotal: number;
    /** Total of all per-line discounts, already deducted from subtotal. */
    lineDiscount: number;
    tax: number;
    discount: number;
    loyaltyDiscount: number;
    manualDiscount: number;
    discountPercent: number;
    /** Largest manual bill discount allowed right now (equals subtotal when unlimited). */
    maxManualDiscount: number;
    deliveryFee: number;
    /** Loyalty balance redeemed, clamped so it never exceeds the amount otherwise due. */
    loyaltyRedeemed: number;
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

function clampDiscountPercent(percent: number, unlimited: boolean): number {
  if (!Number.isFinite(percent) || percent < 0) return 0;
  return Math.min(unlimited ? 100 : MAX_POS_DISCOUNT_PERCENT, percent);
}

function isLineBelowMin(line: Pick<SaleItem, 'price' | 'listPrice' | 'discountPercent'>): boolean {
  return isBelowMinAllowedSalePrice(
    lineNetUnitPrice(line.price, line.discountPercent),
    line.listPrice ?? line.price
  );
}

export const useCartStore = create<CartState>((set, get) => ({
  cartItems: [],
  customerId: '',
  discountMode: 'PERCENT',
  discountPercent: 0,
  discountAmount: 0,
  discountUnlimited: false,
  loyaltyPercent: 0,
  loyaltyRedeemAmount: 0,
  paymentMethod: 'CASH',
  isSplitPayment: false,
  splitPayments: [],
  belowMinManagerPassword: '',
  isDelivery: false,
  deliveryFee: 0,
  deliveryAddress: '',

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
        const belowMin = isLineBelowMin({ ...i, price: charged, listPrice });
        const belowMinApproved = opts?.belowMinApproved === true
          || (!belowMin && i.priceBelowMinApproved);
        return {
          ...i,
          price: charged,
          priceBelowMinApproved: belowMin ? belowMinApproved : false,
        };
      }),
    })),

  updateLineDiscount: (itemId, type, percent, opts) =>
    set((state) => ({
      cartItems: state.cartItems.map((i) => {
        if (!(i.itemId === itemId && i.type === type)) return i;
        const discountPercent = clampLineDiscountPercent(percent);
        const belowMin = isLineBelowMin({ ...i, discountPercent });
        const belowMinApproved = opts?.belowMinApproved === true
          || (!belowMin && i.priceBelowMinApproved);
        return {
          ...i,
          discountPercent,
          priceBelowMinApproved: belowMin ? belowMinApproved : false,
        };
      }),
    })),

  getUnapprovedBelowMinLines: () => {
    const items = get().cartItems;
    return items.filter((i) => isLineBelowMin(i) && !i.priceBelowMinApproved);
  },

  minAllowedPriceForLine: (itemId, type) => {
    const item = get().cartItems.find((i) => i.itemId === itemId && i.type === type);
    if (!item) return 0.01;
    return minAllowedSalePrice(item.listPrice ?? item.price);
  },

  setCustomerId: (customerId) => set({ customerId }),
  setDiscountMode: (discountMode) => set({ discountMode }),
  setDiscountPercent: (percent) =>
    set((state) => ({ discountPercent: clampDiscountPercent(percent, state.discountUnlimited) })),
  setDiscountAmount: (amount) =>
    set({ discountAmount: Number.isFinite(amount) && amount > 0 ? amount : 0 }),
  setDiscountUnlimited: (discountUnlimited) =>
    set((state) => ({
      discountUnlimited,
      discountPercent: clampDiscountPercent(state.discountPercent, discountUnlimited),
    })),
  setLoyaltyPercent: (loyaltyPercent) => set({ loyaltyPercent }),
  setLoyaltyRedeemAmount: (amount) => set({ loyaltyRedeemAmount: Number.isFinite(amount) && amount > 0 ? amount : 0 }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  setSplitPaymentEnabled: (enabled) =>
    set({
      isSplitPayment: enabled,
      splitPayments: enabled
        ? [
            { method: 'CASH', amount: 0 },
            { method: 'CARD', amount: 0 },
          ]
        : [],
    }),
  setSplitPaymentLine: (index, patch) =>
    set((state) => ({
      splitPayments: state.splitPayments.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    })),
  setBelowMinManagerPassword: (password) => set({ belowMinManagerPassword: password }),
  setIsDelivery: (isDelivery) => set({ isDelivery, ...(isDelivery ? {} : { deliveryFee: 0, deliveryAddress: '' }) }),
  setDeliveryFee: (fee) => set({ deliveryFee: Number.isFinite(fee) && fee >= 0 ? fee : 0 }),
  setDeliveryAddress: (address) => set({ deliveryAddress: address }),
  clearCart: () =>
    set({
      cartItems: [],
      customerId: '',
      discountMode: 'PERCENT',
      discountPercent: 0,
      discountAmount: 0,
      loyaltyPercent: 0,
      loyaltyRedeemAmount: 0,
      paymentMethod: 'CASH',
      isSplitPayment: false,
      splitPayments: [],
      belowMinManagerPassword: '',
      isDelivery: false,
      deliveryFee: 0,
      deliveryAddress: '',
    }),

  getTotals: () => {
    const { cartItems: items, discountMode, discountUnlimited } = get();
    const discountPercent = clampDiscountPercent(get().discountPercent, discountUnlimited);
    const loyaltyPercent = get().loyaltyPercent;
    const grossSubtotal = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const subtotal = items.reduce(
      (acc, item) => acc + lineNetUnitPrice(item.price, item.discountPercent) * item.quantity,
      0
    );
    const lineDiscount = Math.max(0, grossSubtotal - subtotal);
    const loyaltyDiscount = subtotal * (loyaltyPercent / 100);
    const maxManualDiscount = discountUnlimited
      ? subtotal
      : subtotal * (MAX_POS_DISCOUNT_PERCENT / 100);
    const manualDiscount = discountMode === 'AMOUNT'
      ? Math.min(Math.max(0, get().discountAmount), maxManualDiscount)
      : subtotal * (discountPercent / 100);
    const discount = Math.min(subtotal, loyaltyDiscount + manualDiscount);
    const tax = 0;
    const deliveryFee = get().isDelivery ? Math.max(0, get().deliveryFee) : 0;
    const preLoyaltyTotal = Math.max(0, subtotal - discount) + tax + deliveryFee;
    // Display-only clamp — the server is the source of truth for the actual balance/cap.
    const loyaltyRedeemed = Math.min(Math.max(0, get().loyaltyRedeemAmount), preLoyaltyTotal);
    const total = preLoyaltyTotal - loyaltyRedeemed;

    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      lineDiscount: parseFloat(lineDiscount.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      discount: parseFloat(discount.toFixed(2)),
      loyaltyDiscount: parseFloat(loyaltyDiscount.toFixed(2)),
      manualDiscount: parseFloat(manualDiscount.toFixed(2)),
      discountPercent,
      maxManualDiscount: parseFloat(maxManualDiscount.toFixed(2)),
      deliveryFee: parseFloat(deliveryFee.toFixed(2)),
      loyaltyRedeemed: parseFloat(loyaltyRedeemed.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
    };
  },
}));
