'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';
import { formatPaise, CYCLE_CONFIG, type BillingCycle } from '@/lib/subscription-pricing';
import { BILLING_SELLER } from '@/lib/billing-info';

type Invoice = {
  id: string;
  billing_cycle: string;
  period_start: string;
  period_end: string;
  subtotal_paise: number;
  gst_paise: number;
  total_paise: number;
  status: string;
  method: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  created_at: string;
  institute?: {
    name?: string; address?: string; city?: string; state?: string; pincode?: string; contact_email?: string;
  } | null;
};

function fmtDate(s?: string): string {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function SubscriptionInvoicePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { data, isLoading, isError } = useQuery<{ data: Invoice }>({
    queryKey: ['sub-invoice', params.id],
    queryFn: () => axios.get(`/api/v1/admin/subscriptions/invoices/${params.id}`).then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }
  if (isError || !data?.data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white p-6 text-center">
        <p className="text-text-2">Invoice not found.</p>
        <button onClick={() => router.push('/billing')} className="text-brand text-sm font-medium cursor-pointer">
          Back to Billing
        </button>
      </div>
    );
  }

  const inv = data.data;
  const invNo = `INV-${new Date(inv.created_at).getFullYear()}-${inv.id.slice(0, 8).toUpperCase()}`;
  const hasGst = inv.gst_paise > 0;
  const cycleLabel = CYCLE_CONFIG[inv.billing_cycle as BillingCycle]?.label ?? inv.billing_cycle;
  const inst = inv.institute;
  const billedToLines = [inst?.address, [inst?.city, inst?.state, inst?.pincode].filter(Boolean).join(', ')].filter(Boolean);

  return (
    <div className="min-h-screen bg-white">
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

      <div className="max-w-2xl mx-auto p-6 md:p-10 text-text">
        {/* Header: seller + invoice meta */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <p className="font-display text-2xl font-semibold tracking-tight">{BILLING_SELLER.brand}</p>
            <p className="text-xs text-text-2 mt-1">{BILLING_SELLER.legalName}</p>
            <p className="text-xs text-text-3">{BILLING_SELLER.address}</p>
            <p className="text-xs text-text-3">{BILLING_SELLER.cityStatePin}</p>
            <p className="text-xs text-text-3">{BILLING_SELLER.email}</p>
            {hasGst && <p className="text-xs text-text-3 mt-1">GSTIN: {BILLING_SELLER.gstin}</p>}
          </div>
          <div className="text-right text-xs text-text-2">
            <p className="font-display text-lg font-semibold text-text">{hasGst ? 'Tax Invoice' : 'Invoice'}</p>
            <p className="font-mono mt-1 text-text">{invNo}</p>
            <p className="mt-1">Date: {fmtDate(inv.created_at)}</p>
            <p className="mt-1 capitalize">Status: {inv.status}</p>
          </div>
        </div>

        {/* Billed to */}
        <div className="mb-8 text-sm">
          <p className="eyebrow mb-1">Billed to</p>
          <p className="font-medium">{inst?.name ?? '—'}</p>
          {billedToLines.map((l, i) => <p key={i} className="text-text-3 text-xs">{l}</p>)}
          {inst?.contact_email && <p className="text-text-3 text-xs">{inst.contact_email}</p>}
        </div>

        {/* Line items */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-text-3">
              <th className="py-2 font-semibold">Description</th>
              <th className="py-2 font-semibold text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <td className="py-2">
                MunchAdda platform subscription — {cycleLabel}
                <span className="block text-xs text-text-3">
                  Period: {fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}
                </span>
              </td>
              <td className="py-2 text-right tabular-nums">{formatPaise(inv.subtotal_paise)}</td>
            </tr>
          </tbody>
        </table>

        {/* Totals */}
        <div className="ml-auto max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-text-2">Subtotal</span>
            <span className="tabular-nums">{formatPaise(inv.subtotal_paise)}</span>
          </div>
          {hasGst && (
            <div className="flex justify-between">
              <span className="text-text-2">GST (18%)</span>
              <span className="tabular-nums">{formatPaise(inv.gst_paise)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-border font-semibold text-base">
            <span>Total</span>
            <span className="tabular-nums">{formatPaise(inv.total_paise)}</span>
          </div>
        </div>

        {/* Transaction details */}
        <div className="mt-10 pt-6 border-t border-border text-xs text-text-2">
          <p className="eyebrow mb-2 text-text-3">Transaction details</p>
          <div className="grid grid-cols-2 gap-y-1">
            <span className="text-text-3">Payment method</span><span className="text-right capitalize">{inv.method ?? '—'}</span>
            <span className="text-text-3">Order ID</span><span className="text-right font-mono break-all">{inv.razorpay_order_id ?? '—'}</span>
            <span className="text-text-3">Payment ID</span><span className="text-right font-mono break-all">{inv.razorpay_payment_id ?? '—'}</span>
            <span className="text-text-3">Paid on</span><span className="text-right">{inv.status === 'paid' ? fmtDate(inv.created_at) : '—'}</span>
          </div>
        </div>

        <p className="text-xs text-text-3 mt-8 text-center">
          {hasGst
            ? 'This is a computer-generated tax invoice.'
            : 'This is a computer-generated invoice. GST not applicable.'}
        </p>
      </div>
    </div>
  );
}
