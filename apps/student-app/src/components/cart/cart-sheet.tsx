'use client';

import { useRouter } from 'next/navigation';
import { Plus, Minus, Trash2, ShoppingCart, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useCartStore, useCartSubtotal, useCartTax, useCartTotal, useCartTotalItems } from '@/store/cart-store';
import { useQuery } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui-store';
import { formatPrice } from '@/lib/formatting';

export function CartSheet() {
  const router = useRouter();
  const { isCartOpen, closeCart } = useUIStore();
  const { items, canteenId, updateQuantity, removeItem, clearCart } = useCartStore();
  const subtotalPaise = useCartSubtotal();
  const { data: canteen } = useQuery({
    queryKey: ['canteen', canteenId],
    queryFn: () =>
      fetch(`/api/v1/canteens/${canteenId}`)
        .then((r) => r.json())
        .then(
          (j) =>
            j.data as { gst_enabled?: boolean; tax_percentage?: number | string } | null
        ),
    enabled: !!canteenId,
  });
  const gstEnabled = canteen?.gst_enabled !== false;
  const taxPercent = Number(canteen?.tax_percentage ?? 5);
  const taxRate = gstEnabled ? taxPercent / 100 : 0;
  const taxPaise = useCartTax(taxRate);
  const totalPaise = useCartTotal(taxRate);
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
          <div className="w-16 h-16 bg-amber-pale rounded-full flex items-center justify-center mb-4">
            <ShoppingCart className="w-8 h-8 text-amber-dark" />
          </div>
          <p className="font-display font-semibold tracking-tight text-lg text-text mb-1">Your cart is empty</p>
          <p className="text-sm text-text-2 mb-5">Add items from a canteen to get started</p>
          <Button onClick={closeCart} className="cursor-pointer">
            Browse Menu
          </Button>
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
                  <p className="text-xs text-text-2 tabular-nums">{formatPrice(ci.menuItem.price_paise)}</p>
                </div>

                {/* Qty controls */}
                <div className="flex items-center gap-1.5 bg-brand-pale rounded-lg p-0.5">
                  <button
                    onClick={() =>
                      ci.quantity === 1
                        ? removeItem(ci.menuItem.id)
                        : updateQuantity(ci.menuItem.id, ci.quantity - 1)
                    }
                    aria-label="Decrease quantity"
                    className="w-6 h-6 bg-brand text-white rounded-md flex items-center justify-center hover:bg-brand-dark transition-colors cursor-pointer"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="w-5 text-center text-xs font-bold text-brand tabular-nums">
                    {ci.quantity}
                  </span>
                  <button
                    onClick={() => updateQuantity(ci.menuItem.id, ci.quantity + 1)}
                    disabled={ci.quantity >= 10}
                    aria-label="Increase quantity"
                    className="w-6 h-6 bg-brand text-white rounded-md flex items-center justify-center hover:bg-brand-dark disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                {/* Subtotal + remove */}
                <div className="flex flex-col items-end gap-1">
                  <span className="font-display font-semibold tracking-tight text-sm text-text tabular-nums">
                    {formatPrice(ci.menuItem.price_paise * ci.quantity)}
                  </span>
                  <button
                    onClick={() => removeItem(ci.menuItem.id)}
                    aria-label="Remove item"
                    className="text-text-3 hover:text-red-500 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="px-5 py-3 bg-surface-2 border-t border-border space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-2">Subtotal</span>
              <span className="text-text tabular-nums">{formatPrice(subtotalPaise)}</span>
            </div>
            {gstEnabled && (
              <div className="flex justify-between text-sm">
                <span className="text-text-2">GST ({taxPercent}%)</span>
                <span className="text-text tabular-nums">{formatPrice(taxPaise)}</span>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-border pt-2">
              <span className="text-sm font-semibold text-text">Total</span>
              <span className="font-display font-semibold tracking-tight text-xl text-text tabular-nums">{formatPrice(totalPaise)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="px-5 py-4 flex gap-3">
            <Button variant="danger-outline" onClick={clearCart} className="cursor-pointer">
              Clear
            </Button>
            <Button onClick={handleCheckout} className="flex-1 cursor-pointer">
              Proceed to Checkout
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="h-4 flex-shrink-0" />
        </div>
      )}
    </BottomSheet>
  );
}
