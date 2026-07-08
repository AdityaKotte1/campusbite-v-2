'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { formatPrice, formatDate } from '@/lib/formatting';
import type { Order } from '@/types';

async function fetchOrder(id: string): Promise<Order> {
  const res = await fetch(`/api/v1/orders/${id}`);
  if (!res.ok) throw new Error('Order not found');
  return (await res.json()).data;
}

export default function InvoicePage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { data: order, isLoading, isError } = useQuery({
    queryKey: ['order', id],
    queryFn: () => fetchOrder(id),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center bg-white">
        <p className="text-text-2">Invoice not found.</p>
        <button onClick={() => router.push('/invoices')} className="text-brand text-sm font-medium cursor-pointer">
          Back to Invoices
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Toolbar — hidden when printing */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-border px-4 py-3 flex items-center justify-between">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-text-2 hover:text-text text-sm cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-brand text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer"
        >
          <Printer className="w-4 h-4" /> Print / Save PDF
        </button>
      </div>

      {/* Invoice body */}
      <div className="max-w-2xl mx-auto p-6 md:p-10 text-text">
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="font-display text-2xl font-semibold tracking-tight">
              Munch<span className="text-brand">Adda</span>
            </p>
            <p className="text-xs text-text-3 mt-1">Tax Invoice</p>
          </div>
          <div className="text-right text-xs text-text-2">
            <p className="font-mono text-sm text-text">{order.order_number}</p>
            <p className="mt-1">{formatDate(order.created_at)}</p>
            <p className="mt-1 capitalize">{order.status}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
          <div>
            <p className="eyebrow mb-1">Billed to</p>
            <p className="font-medium">{user?.full_name ?? 'Customer'}</p>
            {user?.email && <p className="text-text-3 text-xs">{user.email}</p>}
          </div>
          <div>
            <p className="eyebrow mb-1">Canteen</p>
            <p className="font-medium">{order.canteen?.name ?? '—'}</p>
          </div>
        </div>

        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-text-3">
              <th className="py-2 font-semibold">Item</th>
              <th className="py-2 font-semibold text-center">Qty</th>
              <th className="py-2 font-semibold text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.items?.map((it) => (
              <tr key={it.id} className="border-b border-border">
                <td className="py-2">{it.name}</td>
                <td className="py-2 text-center tabular-nums">{it.quantity}</td>
                <td className="py-2 text-right tabular-nums">{formatPrice(it.subtotal_paise)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-text-2">Subtotal</span>
            <span className="tabular-nums">{formatPrice(order.subtotal_paise)}</span>
          </div>
          {order.tax_paise > 0 && (
            <div className="flex justify-between">
              <span className="text-text-2">GST</span>
              <span className="tabular-nums">{formatPrice(order.tax_paise)}</span>
            </div>
          )}
          {order.discount_paise > 0 && (
            <div className="flex justify-between">
              <span className="text-green-dark">Discount</span>
              <span className="text-green-dark tabular-nums">-{formatPrice(order.discount_paise)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-border font-semibold text-base">
            <span>Total</span>
            <span className="tabular-nums">{formatPrice(order.total_paise)}</span>
          </div>
        </div>

        <p className="text-xs text-text-3 mt-10 pt-6 border-t border-border text-center">
          This is a computer-generated invoice. Thank you for ordering with MunchAdda.
        </p>
      </div>
    </div>
  );
}
