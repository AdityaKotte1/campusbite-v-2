'use client';

import { useRouter } from 'next/navigation';
import { Plus, Minus, Trash2, ShoppingCart, ArrowRight } from 'lucide-react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useCartStore, useCartSubtotal, useCartTax, useCartTotal, useCartTotalItems } from '@/store/cart-store';
import { useUIStore } from '@/store/ui-store';
import { formatPrice } from '@/lib/formatting';

export function CartSheet() {
  const router = useRouter();
  const { isCartOpen, closeCart } = useUIStore();
  const { items, updateQuantity, removeItem, clearCart } = useCartStore();
  const subtotalPaise = useCartSubtotal();
  const taxPaise = useCartTax();
  const totalPaise = useCartTotal();
  const totalItems = useCartTotalItems();

  function handleCheckout() {
    closeCart();
    router.push('/cart');
  }

  return (
    <BottomSheet
      isOpen={isCartOpen}
      onClose={closeCart}
      title={`My Cart${totalItems > 0 ? ` (${totalItems})` : ''}`}
    >
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-5 text-center">
          <div className="w-16 h-16 bg-brand-pale rounded-full flex items-center justify-center mb-3">
            <ShoppingCart className="w-8 h-8 text-brand" />
          </div>
          <p className="text-base font-semibold text-text mb-1">Your cart is empty</p>
          <p className="text-sm text-text-2 mb-5">Add items from a canteen to get started</p>
          <button
            onClick={closeCart}
            className="px-5 py-2.5 bg-brand text-white rounded-xl font-semibold text-sm hover:bg-brand-dark transition-colors"
          >
            Browse Menu
          </button>
        </div>
      ) : (
        <div className="flex flex-col">
          {/* Items */}
          <div className="px-5 py-3 divide-y divide-border">
            {items.map((ci) => (
              <div key={ci.menuItem.id} className="py-3 flex items-center gap-3">
                {/* Veg dot */}
                <span
                  className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${
                    ci.menuItem.is_veg ? 'bg-green' : 'bg-red-500'
                  }`}
                />

                {/* Name & price */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text truncate">{ci.menuItem.name}</p>
                  <p className="text-xs text-text-2">{formatPrice(ci.menuItem.price_paise)}</p>
                </div>

                {/* Qty controls */}
                <div className="flex items-center gap-1.5 bg-brand-pale rounded-lg p-0.5">
                  <button
                    onClick={() =>
                      ci.quantity === 1
                        ? removeItem(ci.menuItem.id)
                        : updateQuantity(ci.menuItem.id, ci.quantity - 1)
                    }
                    className="w-6 h-6 bg-brand text-white rounded-md flex items-center justify-center hover:bg-brand-dark transition-colors"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-5 text-center text-xs font-bold text-brand">
                    {ci.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(ci.menuItem.id, ci.quantity + 1)}
                    disabled={ci.quantity >= 10}
                    className="w-6 h-6 bg-brand text-white rounded-md flex items-center justify-center hover:bg-brand-dark disabled:opacity-50 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                {/* Subtotal + remove */}
                <div className="flex flex-col items-end gap-1">
                  <span className="text-sm font-semibold text-text">
                    {formatPrice(ci.menuItem.price_paise * ci.quantity)}
                  </span>
                  <button
                    onClick={() => removeItem(ci.menuItem.id)}
                    className="text-text-3 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="px-5 py-3 bg-bg border-t border-border space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-2">Subtotal</span>
              <span className="text-text">{formatPrice(subtotalPaise)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-2">GST (5%)</span>
              <span className="text-text">{formatPrice(taxPaise)}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t border-border pt-2">
              <span>Total</span>
              <span>{formatPrice(totalPaise)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 py-4 flex gap-3">
            <button
              onClick={clearCart}
              className="px-4 py-3 rounded-xl border-2 border-border text-text-2 font-semibold text-sm hover:border-red-300 hover:text-red-500 transition-colors"
            >
              Clear
            </button>
            <button
              onClick={handleCheckout}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-brand text-white rounded-xl font-bold text-sm hover:bg-brand-dark transition-colors shadow-md"
            >
              Proceed to Checkout
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="h-4 flex-shrink-0" />
        </div>
      )}
    </BottomSheet>
  );
}
