import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { CartItem, MenuItem } from '@/types';
import { TAX_RATE } from '@/lib/constants';

interface CartState {
  items: CartItem[];
  canteenId: string | null;
}

interface CartActions {
  addItem: (item: MenuItem) => void;
  removeItem: (menuItemId: string) => void;
  updateQuantity: (menuItemId: string, quantity: number) => void;
  clearCart: () => void;
}

type CartStore = CartState & CartActions;

export const useCartStore = create<CartStore>()(
  persist(
    immer((set) => ({
      items: [],
      canteenId: null,

      addItem: (menuItem: MenuItem) =>
        set((state) => {
          // Different canteen — clear cart first
          if (state.canteenId && state.canteenId !== menuItem.canteen_id) {
            state.items = [];
            state.canteenId = menuItem.canteen_id;
          }
          if (!state.canteenId) {
            state.canteenId = menuItem.canteen_id;
          }
          const existing = state.items.find((ci) => ci.menuItem.id === menuItem.id);
          if (existing) {
            existing.quantity = Math.min(existing.quantity + 1, 10);
          } else {
            state.items.push({ menuItem, quantity: 1 });
          }
        }),

      removeItem: (menuItemId: string) =>
        set((state) => {
          state.items = state.items.filter((ci) => ci.menuItem.id !== menuItemId);
          if (state.items.length === 0) state.canteenId = null;
        }),

      updateQuantity: (menuItemId: string, quantity: number) =>
        set((state) => {
          if (quantity <= 0) {
            state.items = state.items.filter((ci) => ci.menuItem.id !== menuItemId);
            if (state.items.length === 0) state.canteenId = null;
            return;
          }
          const item = state.items.find((ci) => ci.menuItem.id === menuItemId);
          if (item) item.quantity = Math.min(quantity, 10);
        }),

      clearCart: () =>
        set((state) => {
          state.items = [];
          state.canteenId = null;
        }),
    })),
    {
      name: 'campusbite-cart',
      partialize: (state) => ({
        items: state.items,
        canteenId: state.canteenId,
      }),
    }
  )
);

// ─── Stable selector hooks (computed from items — survive immer rewrites) ─────

export const useCartSubtotal = () =>
  useCartStore((s) =>
    s.items.reduce((sum, ci) => sum + (ci.menuItem.price_paise ?? 0) * ci.quantity, 0)
  );

export const useCartTax = () => {
  const subtotal = useCartSubtotal();
  return Math.round(subtotal * TAX_RATE);
};

export const useCartTotal = () => {
  const subtotal = useCartSubtotal();
  const tax = Math.round(subtotal * TAX_RATE);
  return subtotal + tax;
};

export const useCartTotalItems = () =>
  useCartStore((s) => s.items.reduce((sum, ci) => sum + ci.quantity, 0));
