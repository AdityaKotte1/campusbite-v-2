'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, FileText, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatPrice, formatDate } from '@/lib/formatting';
import type { Order } from '@/types';

async function fetchOrders(): Promise<Order[]> {
  const res = await fetch('/api/v1/orders?per_page=100');
  if (!res.ok) throw new Error('Failed to load orders');
  return (await res.json()).data ?? [];
}

export default function InvoicesPage() {
  const router = useRouter();
  const { data: orders, isLoading } = useQuery({
    queryKey: ['invoices-orders'],
    queryFn: fetchOrders,
  });

  // Invoices are for paid orders only.
  const rows = (orders ?? []).filter((o) => o.payment_status === 'paid');

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-8 space-y-5 animate-fade-up">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-text-2 hover:text-text transition-colors text-sm cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <header>
        <p className="eyebrow">Your account</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-text mt-1">Invoices</h1>
        <div className="rule-amber mt-3" />
      </header>

      {isLoading ? (
        <p className="text-sm text-text-3">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-3">No invoices yet — they appear here once an order is paid.</p>
      ) : (
        <div className="bg-surface rounded-2xl border border-border overflow-hidden divide-y divide-border shadow-sm">
          {rows.map((o) => (
            <Link
              key={o.id}
              href={`/invoice/${o.id}`}
              className="flex items-center gap-3 px-4 py-3.5 min-h-[56px] hover:bg-bg-2 transition-colors duration-150 cursor-pointer"
            >
              <div className="w-9 h-9 bg-brand-pale rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-brand" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text tabular-nums">{o.order_number}</p>
                <p className="text-xs text-text-3 truncate">
                  {[o.canteen?.name, formatDate(o.created_at)].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className="text-sm font-semibold text-text tabular-nums">{formatPrice(o.total_paise)}</span>
              <ChevronRight className="w-4 h-4 text-text-3 flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
