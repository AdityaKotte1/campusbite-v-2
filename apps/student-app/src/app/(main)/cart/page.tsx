'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
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
import { Button } from '@/components/ui/button';
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
  payment_method?: 'online' | 'cash';
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

  // Whether this canteen accepts cash. A null/undefined flag means "enabled"
  // (existing canteens keep cash until an admin turns it off). If cash is off,
  // hide the option and fall back to online so checkout can't submit 'cash'.
  const { data: canteen } = useQuery({
    queryKey: ['canteen', canteenId],
    queryFn: () =>
      fetch(`/api/v1/canteens/${canteenId}`)
        .then((r) => r.json())
        .then(
          (j) =>
            j.data as {
              cash_payments_enabled?: boolean;
              gst_enabled?: boolean;
              tax_percentage?: number | string;
            } | null
        ),
    enabled: !!canteenId,
  });
  const cashEnabled = canteen?.cash_payments_enabled !== false;

  // GST is per-canteen. A null/absent flag means enabled (existing canteens keep GST).
  const gstEnabled = canteen?.gst_enabled !== false;
  const taxPercent = Number(canteen?.tax_percentage ?? 5);
  const taxRate = gstEnabled ? taxPercent / 100 : 0;

  const taxPaise = useCartTax(taxRate);
  const totalPaise = useCartTotal(taxRate);
  const user = useAuthStore((s) => s.user);
  const showToast = useUIStore((s) => s.showToast);

  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount_paise: number;
    description: string;
  } | null>(null);
  const [specialInstructions, setSpecialInstructions] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'cash'>('online');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cashEnabled && paymentMethod === 'cash') setPaymentMethod('online');
  }, [cashEnabled, paymentMethod]);

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
          name: 'MunchAdda',
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

  const cashCheckoutMutation = useMutation({
    mutationFn: async () => {
      if (!canteenId) throw new Error('No items in cart');

      const orderRes = await createOrder({
        canteen_id: canteenId,
        items: items.map((ci) => ({
          menu_item_id: ci.menuItem.id,
          quantity: ci.quantity,
        })),
        coupon_code: appliedCoupon?.code,
        special_instructions: specialInstructions || undefined,
        payment_method: 'cash',
      });

      return orderRes.data as { id: string; order_number?: string };
    },
    onSuccess: (order) => {
      clearCart();
      showToast(
        order.order_number
          ? `Order placed — pay cash at the counter. Order #${order.order_number}.`
          : 'Order placed — pay cash at the counter.',
        'success'
      );
      router.push(`/orders/${order.id}`);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const isCheckoutPending = checkoutMutation.isPending || cashCheckoutMutation.isPending;

  const handleCheckout = () => {
    setError(null);
    if (paymentMethod === 'cash') {
      cashCheckoutMutation.mutate();
    } else {
      checkoutMutation.mutate();
    }
  };

  const discountPaise = appliedCoupon?.discount_paise ?? 0;
  const finalTotalPaise = Math.max(0, totalPaise - discountPaise);

  if (items.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-up">
        <div className="w-20 h-20 bg-amber-pale rounded-full flex items-center justify-center mb-5">
          <ShoppingCart className="w-9 h-9 text-amber-dark" />
        </div>
        <h2 className="font-display font-semibold tracking-tight text-2xl text-text mb-2">Your cart is empty</h2>
        <p className="text-text-2 text-sm mb-6">Add items from a canteen to get started</p>
        <Button size="lg" onClick={() => router.push('/canteens')} className="cursor-pointer">
          Browse Canteens
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-6 space-y-4 animate-fade-up">
      <div>
        <p className="eyebrow mb-1">Checkout</p>
        <h1 className="font-display font-semibold tracking-tight text-2xl text-text">Your Cart</h1>
        <div className="rule-amber mt-2" />
      </div>

      {/* Cart Items */}
      <div className="bg-surface rounded-2xl border border-border divide-y divide-border overflow-hidden">
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
              <p className="text-xs text-text-2 tabular-nums">{formatPrice(ci.menuItem.price_paise)} each</p>
            </div>

            {/* Qty controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateQuantity(ci.menuItem.id, ci.quantity - 1)}
                aria-label="Decrease quantity"
                className="w-7 h-7 rounded-full border border-brand text-brand flex items-center justify-center hover:bg-brand hover:text-white transition-colors cursor-pointer"
              >
                <Minus className="w-3 h-3" />
              </button>
              <span className="w-5 text-center text-sm font-semibold text-text tabular-nums">
                {ci.quantity}
              </span>
              <button
                onClick={() => updateQuantity(ci.menuItem.id, ci.quantity + 1)}
                disabled={ci.quantity >= 10}
                aria-label="Increase quantity"
                className="w-7 h-7 rounded-full bg-brand text-white flex items-center justify-center hover:bg-brand-dark transition-colors disabled:opacity-50 cursor-pointer"
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

      {/* Special Instructions */}
      <div className="bg-surface rounded-2xl border border-border p-4">
        <label className="block text-sm font-semibold text-text mb-2">
          Special Instructions <span className="text-text-3 font-normal">(optional)</span>
        </label>
        <textarea
          value={specialInstructions}
          onChange={(e) => setSpecialInstructions(e.target.value)}
          placeholder="e.g., extra spicy, no onions, extra sauce..."
          maxLength={500}
          rows={3}
          className="w-full px-3.5 py-3 rounded-lg border border-border-2 bg-surface text-sm text-text placeholder:text-text-3 resize-none transition-all hover:border-text-3 focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand"
        />
        <p className="text-xs text-text-3 text-right mt-1 tabular-nums">{specialInstructions.length}/500</p>
      </div>

      {/* Coupon */}
      <div className="bg-surface rounded-2xl border border-border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Tag className="w-4 h-4 text-amber" />
          <span className="text-sm font-semibold text-text">Have a coupon?</span>
        </div>

        {appliedCoupon ? (
          <div className="flex items-center justify-between bg-green-light border border-green/30 rounded-lg px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold text-green-dark">{appliedCoupon.code}</p>
              <p className="text-xs text-green-dark/80">{appliedCoupon.description}</p>
            </div>
            <button
              onClick={() => setAppliedCoupon(null)}
              className="text-xs text-red-500 hover:text-red-700 font-medium cursor-pointer"
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
              className="flex-1 px-3.5 py-3 rounded-lg border border-border-2 bg-surface text-sm text-text placeholder:text-text-3 transition-all hover:border-text-3 focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand"
            />
            <Button
              onClick={() => couponMutation.mutate()}
              disabled={!couponCode.trim() || couponMutation.isPending}
              className="cursor-pointer"
            >
              {couponMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Apply'}
            </Button>
          </div>
        )}
      </div>

      {/* Order Summary */}
      <div className="bg-surface rounded-2xl border border-border p-4">
        <p className="eyebrow mb-3">Order Summary</p>
        <div className="space-y-2.5">
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
          {discountPaise > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-green-dark">Coupon Discount</span>
              <span className="text-green-dark tabular-nums">-{formatPrice(discountPaise)}</span>
            </div>
          )}
          <div className="h-px bg-border" />
          <div className="flex items-baseline justify-between">
            <span className="font-semibold text-text">Total</span>
            <span className="font-display font-semibold tracking-tight text-text text-2xl tabular-nums">{formatPrice(finalTotalPaise)}</span>
          </div>
        </div>
      </div>

      {/* Payment Method */}
      <div className="bg-surface rounded-2xl border border-border p-4">
        <p className="eyebrow mb-3">Payment Method</p>
        <div className={`grid gap-2 ${cashEnabled ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <button
            type="button"
            onClick={() => setPaymentMethod('online')}
            aria-pressed={paymentMethod === 'online'}
            className={`rounded-lg border px-3 py-3 text-sm font-semibold transition-colors cursor-pointer ${
              paymentMethod === 'online'
                ? 'border-brand bg-brand text-white'
                : 'border-border-2 bg-surface text-text hover:border-text-3'
            }`}
          >
            Pay online
          </button>
          {cashEnabled && (
            <button
              type="button"
              onClick={() => setPaymentMethod('cash')}
              aria-pressed={paymentMethod === 'cash'}
              className={`rounded-lg border px-3 py-3 text-sm font-semibold transition-colors cursor-pointer ${
                paymentMethod === 'cash'
                  ? 'border-brand bg-brand text-white'
                  : 'border-border-2 bg-surface text-text hover:border-text-3'
              }`}
            >
              Pay by cash
            </button>
          )}
        </div>
        {cashEnabled && paymentMethod === 'cash' && (
          <p className="text-xs text-text-3 mt-2.5">
            Place your order now and pay with cash at the counter. Your order will be confirmed once staff accept it.
          </p>
        )}
        {!cashEnabled && (
          <p className="text-xs text-text-3 mt-2.5">
            This canteen accepts online payment only.
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Checkout Button */}
      <Button
        size="xl"
        onClick={handleCheckout}
        disabled={isCheckoutPending || items.length === 0}
        className="w-full cursor-pointer"
      >
        {isCheckoutPending ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Processing...
          </>
        ) : paymentMethod === 'cash' ? (
          <>
            <span>Place Order — <span className="font-display tracking-tight tabular-nums">{formatPrice(finalTotalPaise)}</span></span>
            <ChevronRight className="w-5 h-5" />
          </>
        ) : (
          <>
            <span>Proceed to Payment — <span className="font-display tracking-tight tabular-nums">{formatPrice(finalTotalPaise)}</span></span>
            <ChevronRight className="w-5 h-5" />
          </>
        )}
      </Button>

      <p className="text-xs text-text-3 text-center">
        {paymentMethod === 'cash'
          ? 'Pay with cash at the counter when you collect your order.'
          : 'Secured by Razorpay. Your payment information is encrypted.'}
      </p>
    </div>
  );
}
