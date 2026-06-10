'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, QrCode, List, AlertCircle, Loader2 } from 'lucide-react';
import { OrderTracker } from '@/components/order/order-tracker';
import { QRDisplay } from '@/components/order/qr-display';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatPrice, formatDate } from '@/lib/formatting';
import { ORDER_STATUS_LABELS, CANCELLABLE_STATUSES, POLLING_INTERVAL_MS } from '@/lib/constants';
import type { Order } from '@/types';

async function fetchOrder(id: string): Promise<Order> {
  const res = await fetch(`/api/v1/orders/${id}`);
  if (!res.ok) throw new Error('Order not found');
  const json = await res.json();
  return json.data;
}

async function cancelOrder(id: string): Promise<void> {
  const res = await fetch(`/api/v1/orders/${id}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Cancelled by user' }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message ?? 'Failed to cancel order');
  }
}

interface Props {
  params: { id: string };
}

export default function OrderDetailPage({ params }: Props) {
  const { id } = params;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'status' | 'qr'>('status');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['order', id],
    queryFn: () => fetchOrder(id),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const active = ['payment_pending', 'confirmed', 'preparing', 'ready'];
      return active.includes(data.status) ? POLLING_INTERVAL_MS : false;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelOrder(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setShowCancelConfirm(false);
    },
    onError: (err: Error) => {
      setCancelError(err.message);
      setShowCancelConfirm(false);
    },
  });

  const isCancellable = order && CANCELLABLE_STATUSES.includes(order.status);
  const canShowQR = order?.payment_status === 'paid' && order?.status !== 'cancelled' && order?.status !== 'payment_failed';

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        <Skeleton className="h-10 w-32 rounded-xl" />
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="max-w-lg mx-auto px-4 pt-12 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-text mb-2">Order not found</h2>
        <button onClick={() => router.push('/orders')} className="text-brand text-sm font-medium">
          Back to Orders
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-6 space-y-4">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-text-2 hover:text-text transition-colors text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Orders
      </button>

      {/* Order header */}
      <div className="bg-white rounded-2xl border border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-text-3 mb-0.5">Order</p>
            <p className="font-bold text-text">{order.order_number}</p>
            <p className="text-xs text-text-2 mt-1">
              {order.canteen?.name ?? 'Canteen'} · {formatDate(order.created_at)}
            </p>
          </div>
          <Badge
            variant={
              order.status === 'ready'
                ? 'success'
                : order.status === 'cancelled' || order.status === 'payment_failed'
                ? 'error'
                : order.status === 'collected'
                ? 'default'
                : 'warning'
            }
          >
            {ORDER_STATUS_LABELS[order.status] ?? order.status}
          </Badge>
        </div>

        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-sm">
          <span className="text-text-2">Total</span>
          <span className="font-bold text-text">{formatPrice(order.total_paise)}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl bg-bg border border-border p-1 gap-1">
        <button
          onClick={() => setActiveTab('status')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'status'
              ? 'bg-white text-text shadow-sm'
              : 'text-text-2 hover:text-text'
          }`}
        >
          <List className="w-4 h-4" />
          Status
        </button>
        <button
          onClick={() => setActiveTab('qr')}
          disabled={!canShowQR}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            activeTab === 'qr'
              ? 'bg-white text-text shadow-sm'
              : 'text-text-2 hover:text-text'
          }`}
        >
          <QrCode className="w-4 h-4" />
          QR Code
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'status' ? (
        <div className="space-y-4">
          <OrderTracker order={order} />

          {/* Order Items */}
          <div className="bg-white rounded-2xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-text">Items Ordered</h3>
            </div>
            {order.items?.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0">
                <div className="flex-1">
                  <p className="text-sm text-text font-medium">
                    {item.quantity}× {item.name}
                  </p>
                  {item.special_note && (
                    <p className="text-xs text-text-3 mt-0.5">{item.special_note}</p>
                  )}
                </div>
                <span className="text-sm font-medium text-text">
                  {formatPrice(item.subtotal_paise)}
                </span>
              </div>
            ))}

            {/* Price breakdown */}
            <div className="px-4 py-3 bg-bg space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-text-2">Subtotal</span>
                <span>{formatPrice(order.subtotal_paise)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-2">GST</span>
                <span>{formatPrice(order.tax_paise)}</span>
              </div>
              {order.discount_paise > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green">Discount</span>
                  <span className="text-green">-{formatPrice(order.discount_paise)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold pt-1 border-t border-border">
                <span>Total</span>
                <span>{formatPrice(order.total_paise)}</span>
              </div>
            </div>
          </div>

          {/* Special instructions */}
          {order.special_instructions && (
            <div className="bg-white rounded-2xl border border-border p-4">
              <p className="text-xs text-text-3 mb-1">Special Instructions</p>
              <p className="text-sm text-text">{order.special_instructions}</p>
            </div>
          )}

          {/* Payment info */}
          {order.razorpay_payment_id && (
            <div className="bg-white rounded-2xl border border-border p-4">
              <p className="text-xs text-text-3 mb-1">Payment ID</p>
              <p className="text-sm font-mono text-text">{order.razorpay_payment_id}</p>
            </div>
          )}

          {/* Cancel error */}
          {cancelError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
              <p className="text-sm text-red-700">{cancelError}</p>
            </div>
          )}

          {/* Cancel button */}
          {isCancellable && (
            <>
              {showCancelConfirm ? (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <p className="text-sm font-medium text-red-800 mb-3">
                    Are you sure you want to cancel this order?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => cancelMutation.mutate()}
                      disabled={cancelMutation.isPending}
                      className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-60 flex items-center justify-center gap-1"
                    >
                      {cancelMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        'Yes, Cancel'
                      )}
                    </button>
                    <button
                      onClick={() => setShowCancelConfirm(false)}
                      className="flex-1 py-2.5 bg-white border border-border text-text rounded-xl text-sm font-semibold hover:bg-bg"
                    >
                      Keep Order
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="w-full py-3 rounded-2xl border-2 border-red-300 text-red-600 font-semibold text-sm hover:bg-red-50 transition-colors"
                >
                  Cancel Order
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        canShowQR && <QRDisplay orderId={id} />
      )}
    </div>
  );
}
