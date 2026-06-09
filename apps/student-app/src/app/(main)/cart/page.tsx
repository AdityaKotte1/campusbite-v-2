'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Tag,
  ChevronRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useCartStore, useCartSubtotal, useCartTax, useCartTotal } from '@/store/cart-store';
import { useAuthStore } from '@/store/auth-store';
import { useUIStore } from '@/store/ui-store';
import { formatPrice } from '@/lib/formatting';
import type { RazorpayOrderResponse } from '@/types';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

async function createPaymentOrder(orderId: string): Promise<RazorpayOrderResponse> {
  const res = await fetch('/api/v1/payments/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: orderId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message ?? 'Payment creation failed');
  }
  return res.json();
}

async function createOrder(payload: {
  canteen_id: string;
  items: Array<{ menu_item_id: string; quantity: number }>;
  coupon_code?: string;
  special_instructions?: string;
}) {
  const res = await fetch('/api/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message ?? 'Failed to create order');
  }
  return res.json();
}

async function validateCoupon(code: string, canteenId: string) {
  const res = await fetch('/api/v1/coupons/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, canteen_id: canteenId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message ?? 'Invalid coupon');
  }
  return res.json();
}

export default function CartPage() {
  const router = useRouter();
  const { items, canteenId, updateQuantity, removeItem, clearCart } = useCartStore();
  const subtotalPaise = useCartSubtotal();
  const taxPaise = useCartTax();
  const totalPaise = useCartTotal();
  const user = useAuthStore((s) => s.user);
  const showToast = useUIStore((s) => s.showToast);

  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount_paise: number;
    description: string;
  } | null>(null);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [error, setError] = useState<string | null>(null);

  const couponMutation = useMutation({
    mutationFn: () => validateCoupon(couponCode, canteenId!),
    onSuccess: (data) => {
      const discountPaise =
        data.discount_type === 'percentage'
          ? Math.min(
              Math.round((subtotalPaise * data.discount_value) / 100),
              data.max_discount_paise ?? Infinity
            )
          : data.discount_value * 100;
      setAppliedCoupon({
        code: couponCode.toUpperCase(),
        discount_paise: discountPaise,
        description: data.description ?? `${data.discount_value}% off`,
      });
      showToast('Coupon applied!', 'success');
      setCouponCode('');
    },
    onError: (err: Error) => {
      showToast(err.message, 'error');
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (!canteenId) throw new Error('No items in cart');

      // 1. Create order
      const orderRes = await createOrder({
        canteen_id: canteenId,
        items: items.map((ci) => ({
          menu_item_id: ci.menuItem.id,
          quantity: ci.quantity,
        })),
        coupon_code: appliedCoupon?.code,
        special_instructions: specialInstructions || undefined,
      });

      const orderId: string = orderRes.data.id;

      // 2. Create Razorpay order
      const paymentOrder = await createPaymentOrder(orderId);

      // 3. Open Razorpay
      if (typeof window.Razorpay === 'undefined') {
        throw new Error('Payment SDK not loaded yet. Please wait a moment and try again.');
      }

      return new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay({
          key: paymentOrder.key_id,
          amount: paymentOrder.amount,
          currency: paymentOrder.currency,
          name: 'CampusBite',
          description: `Order from ${paymentOrder.canteen_name}`,
          order_id: paymentOrder.order_id,
          prefill: {
            name: user?.full_name,
            email: user?.email,
            contact: user?.phone ?? '',
          },
          theme: { color: '#E8390E' },
          handler: async (response: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            try {
              const verifyRes = await fetch('/api/v1/payments/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  order_id: orderId,
                }),
              });
              if (!verifyRes.ok) {
                const errJson = await verifyRes.json().catch(() => ({}));
                reject(new Error(errJson.message ?? 'Payment verification failed. Your payment was collected — please contact support with your order ID: ' + orderId));
                return;
              }
              clearCart();
              resolve();
              router.push(`/orders/${orderId}`);
            } catch {
              reject(new Error('Payment verification failed'));
            }
          },
          modal: {
            ondismiss: () => reject(new Error('Payment cancelled')),
          },
        });
        rzp.open();
      });
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const discountPaise = appliedCoupon?.discount_paise ?? 0;
  const finalTotalPaise = Math.max(0, totalPaise - discountPaise);

  if (items.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-20 h-20 bg-brand-pale rounded-full flex items-center justify-center mb-4">
          <ShoppingCart className="w-10 h-10 text-brand" />
        </div>
        <h2 className="text-xl font-bold text-text mb-2">Your cart is empty</h2>
        <p className="text-text-2 text-sm mb-6">Add items from a canteen to get started</p>
        <button
          onClick={() => router.push('/canteens')}
          className="px-6 py-3 bg-brand text-white rounded-xl font-semibold text-sm hover:bg-brand-dark transition-colors"
        >
          Browse Canteens
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-6 space-y-4">
      <h1 className="text-xl font-bold text-text">Your Cart</h1>

      {/* Cart Items */}
      <div className="bg-white rounded-2xl border border-border divide-y divide-border overflow-hidden">
        {items.map((ci) => (
          <div key={ci.menuItem.id} className="flex items-center gap-3 p-4">
            {/* Veg/Non-veg dot */}
            <div className="flex-shrink-0">
              <span
                className={`inline-block w-2.5 h-2.5 rounded-full ${
                  ci.menuItem.is_veg ? 'bg-green' : 'bg-red-500'
                }`}
              />
            </div>

            {/* Name */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text truncate">{ci.menuItem.name}</p>
              <p className="text-xs text-text-2">{formatPrice(ci.menuItem.price_paise)} each</p>
            </div>

            {/* Qty controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateQuantity(ci.menuItem.id, ci.quantity - 1)}
                className="w-7 h-7 rounded-full border border-brand text-brand flex items-center justify-center hover:bg-brand hover:text-white transition-colors"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="w-5 text-center text-sm font-semibold text-text">
                {ci.quantity}
              </span>
              <button
                onClick={() => updateQuantity(ci.menuItem.id, ci.quantity + 1)}
                disabled={ci.quantity >= 10}
                className="w-7 h-7 rounded-full bg-brand text-white flex items-center justify-center hover:bg-brand-dark transition-colors disabled:opacity-50"
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

      {/* Special Instructions */}
      <div className="bg-white rounded-2xl border border-border p-4">
        <label className="block text-sm font-semibold text-text mb-2">
          Special Instructions <span className="text-text-3 font-normal">(optional)</span>
        </label>
        <textarea
          value={specialInstructions}
          onChange={(e) => setSpecialInstructions(e.target.value)}
          placeholder="e.g., extra spicy, no onions, extra sauce..."
          maxLength={500}
          rows={3}
          className="w-full px-3 py-2.5 rounded-xl border border-border text-sm text-text placeholder:text-text-3 resize-none focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
        />
        <p className="text-xs text-text-3 text-right mt-1">{specialInstructions.length}/500</p>
      </div>

      {/* Coupon */}
      <div className="bg-white rounded-2xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Tag className="w-4 h-4 text-brand" />
          <span className="text-sm font-semibold text-text">Have a coupon?</span>
        </div>

        {appliedCoupon ? (
          <div className="flex items-center justify-between bg-green-light border border-green rounded-xl px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold text-green">{appliedCoupon.code}</p>
              <p className="text-xs text-green-dark">{appliedCoupon.description}</p>
            </div>
            <button
              onClick={() => setAppliedCoupon(null)}
              className="text-xs text-red-500 hover:text-red-700 font-medium"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="Enter coupon code"
              className="flex-1 px-3 py-2.5 rounded-xl border border-border text-sm text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
            />
            <button
              onClick={() => couponMutation.mutate()}
              disabled={!couponCode.trim() || couponMutation.isPending}
              className="px-4 py-2.5 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-dark disabled:opacity-50 transition-colors flex items-center gap-1"
            >
              {couponMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Apply'}
            </button>
          </div>
        )}
      </div>

      {/* Order Summary */}
      <div className="bg-white rounded-2xl border border-border p-4 space-y-2.5">
        <h3 className="text-sm font-semibold text-text mb-3">Order Summary</h3>
        <div className="flex justify-between text-sm">
          <span className="text-text-2">Subtotal</span>
          <span className="text-text">{formatPrice(subtotalPaise)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-text-2">GST (5%)</span>
          <span className="text-text">{formatPrice(taxPaise)}</span>
        </div>
        {discountPaise > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-green">Coupon Discount</span>
            <span className="text-green">-{formatPrice(discountPaise)}</span>
          </div>
        )}
        <div className="h-px bg-border" />
        <div className="flex justify-between">
          <span className="font-bold text-text">Total</span>
          <span className="font-bold text-text text-lg">{formatPrice(finalTotalPaise)}</span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Checkout Button */}
      <button
        onClick={() => checkoutMutation.mutate()}
        disabled={checkoutMutation.isPending || items.length === 0}
        className="w-full py-4 bg-brand text-white rounded-2xl font-bold text-base shadow-lg hover:bg-brand-dark transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {checkoutMutation.isPending ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            Proceed to Payment — {formatPrice(finalTotalPaise)}
            <ChevronRight className="w-5 h-5" />
          </>
        )}
      </button>

      <p className="text-xs text-text-3 text-center">
        Secured by Razorpay. Your payment information is encrypted.
      </p>
    </div>
  );
}
