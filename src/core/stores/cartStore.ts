import { create } from 'zustand';
import { SaleItem } from '../../types/erp';

interface CartState {
  cartItems: SaleItem[];
  customerId: string;
  discount: number; // Flat discount
  paymentMethod: 'CASH' | 'CARD' | 'MOBILE';
  
  addItem: (item: Omit<SaleItem, 'quantity' | 'id'>) => void;
  removeItem: (itemId: string, type: SaleItem['type']) => void;
  updateQuantity: (itemId: string, type: SaleItem['type'], quantity: number) => void;
  setCustomerId: (customerId: string) => void;
  setDiscount: (discount: number) => void;
  setPaymentMethod: (method: 'CASH' | 'CARD' | 'MOBILE') => void;
  clearCart: () => void;
  getTotals: () => { subtotal: number; tax: number; discount: number; total: number };
}

export const useCartStore = create<CartState>((set, get) => ({
  cartItems: [],
  customerId: '',
  discount: 0,
  paymentMethod: 'CASH',

  addItem: (item) => set((state) => {
    const existing = state.cartItems.find(
      i => i.itemId === item.itemId && i.type === item.type
    );
    if (existing) {
      return {
        cartItems: state.cartItems.map(i =>
          i.itemId === item.itemId && i.type === item.type
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      };
    }
    return {
      cartItems: [...state.cartItems, { ...item, quantity: 1, id: `item-${Date.now()}` }]
    };
  }),

  removeItem: (itemId, type) => set((state) => ({
    cartItems: state.cartItems.filter(i => !(i.itemId === itemId && i.type === type))
  })),

  updateQuantity: (itemId, type, quantity) => set((state) => ({
    cartItems: state.cartItems.map(i =>
      i.itemId === itemId && i.type === type
        ? { ...i, quantity: Math.max(1, quantity) }
        : i
    )
  })),

  setCustomerId: (customerId) => set({ customerId }),
  setDiscount: (discount) => set({ discount }),
  setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
  clearCart: () => set({ cartItems: [], customerId: '', discount: 0, paymentMethod: 'CASH' }),
  
  getTotals: () => {
    const items = get().cartItems;
    const discount = get().discount;
    const subtotal = items.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const taxRate = 0.10; // Standard 10% tax
    const afterDiscount = Math.max(0, subtotal - discount);
    const tax = afterDiscount * taxRate;
    const total = afterDiscount + tax;

    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      discount: parseFloat(discount.toFixed(2)),
      total: parseFloat(total.toFixed(2))
    };
  }
}));
