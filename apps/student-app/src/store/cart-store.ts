import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { CartItem, MenuItem } from '@/types';
import { TAX_RATE } from '@/lib/constants';

interface CartState {
  items: CartItem[];
  canteenId: string | null;
}

/** Result of an addItem attempt. `ok: false` means the item was rejected
 *  (e.g. it would violate a separate-billing category's order-alone rule);
 *  `reason` is a user-facing message the caller can surface as a toast. */
export interface AddItemResult {
  ok: boolean;
  reason?: string;
}

interface CartActions {
  addItem: (item: MenuItem) => AddItemResult;
  removeItem: (menuItemId: string) => void;
  updateQuantity: (menuItemId: string, quantity: number) => void;
  clearCart: () => void;
}

type CartStore = CartState & CartActions;

export const useCartStore = create<CartStore>()(
  persist(
    immer((set, get) => ({
      items: [],
      canteenId: null,

      addItem: (menuItem: MenuItem): AddItemResult => {
        const state = get();

        // Switching canteens clears the cart, so evaluate the separate-billing
        // rule against what the cart will actually contain: empty on a switch.
        const switchingCanteen =
          !!state.canteenId && state.canteenId !== menuItem.canteen_id;
        const currentItems = switchingCanteen ? [] : state.items;

        const newCategoryId = menuItem.category_id ?? null;
        const newIsSeparate = menuItem.category?.separate_billing === true;

        if (newIsSeparate) {
          // A separate-billing item is order-alone: reject if the cart already
          // holds anything from a different category.
          const clash = currentItems.find(
            (ci) => (ci.menuItem.category_id ?? null) !== newCategoryId
          );
          if (clash) {
            const name = menuItem.category?.name ?? 'This item';
            return {
              ok: false,
              reason: `${name} can only be ordered separately. Clear your cart or check out first.`,
            };
          }
        } else {
          // A normal item can't join a cart that holds a separate-billing item.
          const separateItem = currentItems.find(
            (ci) => ci.menuItem.category?.separate_billing === true
          );
          if (separateItem) {
            const name = separateItem.menuItem.category?.name ?? 'That item';
            return {
              ok: false,
              reason: `${name} must be ordered separately. Check out or remove it before adding other items.`,
            };
          }
        }

        set((s) => {
          // Different canteen — clear cart first
          if (s.canteenId && s.canteenId !== menuItem.canteen_id) {
            s.items = [];
            s.canteenId = menuItem.canteen_id;
          }
          if (!s.canteenId) {
            s.canteenId = menuItem.canteen_id;
          }
          const existing = s.items.find((ci) => ci.menuItem.id === menuItem.id);
          if (existing) {
            existing.quantity = Math.min(existing.quantity + 1, 10);
          } else {
            s.items.push({ menuItem, quantity: 1 });
          }
        });

        return { ok: true };
      },

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
      name: 'munchadda-cart',
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

export const useCartTax = (rate: number = TAX_RATE) => {
  const subtotal = useCartSubtotal();
  return Math.round(subtotal * rate);
};

export const useCartTotal = (rate: number = TAX_RATE) => {
  const subtotal = useCartSubtotal();
  const tax = Math.round(subtotal * rate);
  return subtotal + tax;
};

export const useCartTotalItems = () =>
  useCartStore((s) => s.items.reduce((sum, ci) => sum + ci.quantity, 0));
