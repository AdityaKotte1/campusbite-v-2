'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, User, Store, CreditCard, QrCode } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { StatusUpdateButton } from '@/components/orders/status-update-button';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDateTime } from '@/lib/formatting';
import { VALID_STATUS_TRANSITIONS } from '@/lib/constants';
import type { Order, OrderStatus } from '@/types';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<Order>({
    queryKey: ['order', id],
    queryFn: async () => {
      const { data } = await axios.get(`/api/v1/admin/orders/${id}`);
      return data.data;
    },
  });

  const handleUpdateStatus = async (orderId: string, newStatus: string) => {
    await axios.put(`/api/v1/admin/orders/${orderId}/status`, { status: newStatus });
    queryClient.invalidateQueries({ queryKey: ['order', id] });
    queryClient.invalidateQueries({ queryKey: ['orders'] });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-text-3" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-center py-20 text-text-3">Order not found.</div>;
  }

  const canCancel = VALID_STATUS_TRANSITIONS[data.status]?.includes('cancelled');
  const canRefund = VALID_STATUS_TRANSITIONS[data.status]?.includes('refunded');

  return (
    <div className="max-w-4xl space-y-5">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Link href="/orders">
          <Button variant="outline" size="icon-sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-lg font-semibold text-text tracking-tight">{data.order_number}</h2>
            <OrderStatusBadge status={data.status} />
          </div>
          <p className="text-xs text-text-3 mt-0.5">{formatDateTime(data.created_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusUpdateButton
            orderId={data.id}
            currentStatus={data.status as OrderStatus}
            onUpdate={handleUpdateStatus}
          />
          {canCancel && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleUpdateStatus(data.id, 'cancelled')}
            >
              Cancel Order
            </Button>
          )}
          {canRefund && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleUpdateStatus(data.id, 'refunded')}
            >
              Refund
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Items */}
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="font-display tracking-tight">Order Items</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-text-3 uppercase bg-bg-2 border-b border-border">Item</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold text-text-3 uppercase bg-bg-2 border-b border-border">Qty</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-text-3 uppercase bg-bg-2 border-b border-border">Price</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold text-text-3 uppercase bg-bg-2 border-b border-border">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.order_items?.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0">
                      <td className="px-5 py-3">
                        <p className="font-medium text-text">{item.item_name}</p>
                        {item.special_instructions && (
                          <p className="text-xs text-text-3 mt-0.5">{item.special_instructions}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-center text-text-2">×{item.quantity}</td>
                      <td className="px-5 py-3 text-right text-text-2">
                        {formatCurrency(item.unit_price_paise)}
                      </td>
                      <td className="px-5 py-3 text-right font-medium text-text">
                        {formatCurrency(item.total_price_paise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border">
                    <td colSpan={3} className="px-5 py-2 text-right text-sm text-text-2">Subtotal</td>
                    <td className="px-5 py-2 text-right text-sm font-medium text-text">{formatCurrency(data.subtotal_paise)}</td>
                  </tr>
                  {data.tax_paise > 0 && (
                    <tr>
                      <td colSpan={3} className="px-5 py-1 text-right text-sm text-text-2">Tax</td>
                      <td className="px-5 py-1 text-right text-sm text-text">{formatCurrency(data.tax_paise)}</td>
                    </tr>
                  )}
                  {data.discount_paise > 0 && (
                    <tr>
                      <td colSpan={3} className="px-5 py-1 text-right text-sm text-green-dark">Discount</td>
                      <td className="px-5 py-1 text-right text-sm text-green-dark">-{formatCurrency(data.discount_paise)}</td>
                    </tr>
                  )}
                  <tr className="border-t border-border">
                    <td colSpan={3} className="px-5 py-3 text-right font-semibold text-text">Total</td>
                    <td className="px-5 py-3 text-right font-display text-lg font-semibold text-text tabular-nums tracking-tight">{formatCurrency(data.total_paise)}</td>
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>

          {/* Special Instructions */}
          {data.special_instructions && (
            <Card>
              <CardHeader><CardTitle>Special Instructions</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-text-2">{data.special_instructions}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar info */}
        <div className="space-y-4">
          {/* Customer */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-4 h-4" /> Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-sm font-medium text-text">{data.user?.full_name ?? '—'}</p>
              <p className="text-sm text-text-2">{data.user?.email ?? '—'}</p>
              {data.user?.phone && <p className="text-sm text-text-2">{data.user.phone}</p>}
            </CardContent>
          </Card>

          {/* Canteen */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="w-4 h-4" /> Canteen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-sm font-medium text-text">{data.canteen?.name ?? '—'}</p>
              <p className="text-sm text-text-2">{data.canteen?.location ?? '—'}</p>
            </CardContent>
          </Card>

          {/* Payment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-text-2">Status</span>
                <span className={`font-medium capitalize ${data.payment_status === 'paid' ? 'text-green-dark' : 'text-text'}`}>
                  {data.payment_status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-2">Method</span>
                <span className="text-text capitalize">{data.payment_method ?? '—'}</span>
              </div>
              {data.payment_id && (
                <div>
                  <span className="text-text-2">Transaction ID</span>
                  <p className="font-mono text-xs text-text mt-0.5 break-all">{data.payment_id}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* QR Token */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="w-4 h-4" /> QR Token
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p className="text-text-2">
                {data.collected_at ? (
                  <>Scanned at {formatDateTime(data.collected_at)}</>
                ) : data.status === 'ready' ? (
                  <span className="text-green-dark font-medium">Token Active – Awaiting Scan</span>
                ) : (
                  '—'
                )}
              </p>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader><CardTitle>Timeline</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-3">
                <TimelineItem label="Order Placed" time={data.created_at} />
                {data.ready_at && <TimelineItem label="Ready" time={data.ready_at} />}
                {data.collected_at && <TimelineItem label="Collected" time={data.collected_at} />}
                {data.cancelled_at && <TimelineItem label="Cancelled" time={data.cancelled_at} isNegative />}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TimelineItem({
  label,
  time,
  isNegative = false,
}: {
  label: string;
  time: string;
  isNegative?: boolean;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <div
        className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
          isNegative ? 'bg-red-400' : 'bg-green'
        }`}
      />
      <div>
        <p className="text-sm font-medium text-text">{label}</p>
        <p className="text-xs text-text-3">{formatDateTime(time)}</p>
      </div>
    </li>
  );
}
