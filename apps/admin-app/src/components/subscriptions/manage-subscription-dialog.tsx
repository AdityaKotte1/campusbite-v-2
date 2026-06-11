'use client';

import { useState } from 'react';
import axios from 'axios';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  computeSubscription,
  formatPaise,
  studentTierLabel,
  CYCLE_CONFIG,
  type BillingCycle,
} from '@/lib/subscription-pricing';

interface Row {
  institute_id: string;
  institute_name: string;
  canteen_count: number;
  student_count: number;
  subscription: { status?: string; current_period_end?: string } | null;
}

export function ManageSubscriptionDialog({
  row,
  onClose,
  onDone,
}: {
  row: Row;
  onClose: () => void;
  onDone: () => void;
}) {
  const [cycle, setCycle] = useState<BillingCycle>('monthly');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const quote = computeSubscription(row.canteen_count, row.student_count, cycle);

  const act = async (action: string, opts: Record<string, unknown> = {}) => {
    setBusy(action);
    setError('');
    try {
      await axios.post('/api/v1/admin/subscriptions', {
        institute_id: row.institute_id,
        action,
        billing_cycle: cycle,
        ...opts,
      });
      onDone();
      onClose();
    } catch (e) {
      setError(axios.isAxiosError(e) ? e.response?.data?.error?.message ?? 'Action failed' : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-surface rounded-xl border border-border shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text">Manage Subscription</h2>
          <button onClick={onClose} className="p-1 rounded text-text-3 hover:text-text transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-text">{row.institute_name}</p>
            <p className="text-xs text-text-3">
              {row.canteen_count} canteen{row.canteen_count === 1 ? '' : 's'} ·{' '}
              {row.student_count.toLocaleString('en-IN')} students ({studentTierLabel(row.student_count)})
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Cycle selector */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Billing cycle</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(CYCLE_CONFIG) as BillingCycle[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCycle(c)}
                  className={`px-2 py-2 rounded-lg border text-xs font-medium transition ${
                    cycle === c ? 'border-brand bg-brand-pale text-brand' : 'border-border text-text-2 hover:bg-bg'
                  }`}
                >
                  {c === 'monthly' ? 'Monthly' : c === 'biannual' ? '6 Months' : 'Annual'}
                </button>
              ))}
            </div>
          </div>

          {/* Quote */}
          <div className="bg-bg rounded-lg border border-border p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-text-2">Per-month base</span>
              <span>{formatPaise(quote.monthlyBasePaise)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-2">
                {quote.months} month{quote.months === 1 ? '' : 's'}
                {quote.discountPct ? `, ${Math.round(quote.discountPct * 100)}% off` : ''}
              </span>
              <span>{formatPaise(quote.subtotalPaise)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-2">GST (18%)</span>
              <span>{formatPaise(quote.gstPaise)}</span>
            </div>
            <div className="flex justify-between font-bold pt-1 border-t border-border">
              <span>Total</span>
              <span>{formatPaise(quote.totalPaise)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-1">
            <Button className="w-full" disabled={!!busy} onClick={() => act('activate', { mark_paid: true })}>
              {busy === 'activate' && <Loader2 className="w-4 h-4 animate-spin" />}
              Activate &amp; mark paid — {formatPaise(quote.totalPaise)}
            </Button>
            <Button variant="outline" className="w-full" disabled={!!busy} onClick={() => act('extend', { mark_paid: true })}>
              {busy === 'extend' && <Loader2 className="w-4 h-4 animate-spin" />}
              Extend current period
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" disabled={!!busy} onClick={() => act('trial')}>
                {busy === 'trial' && <Loader2 className="w-4 h-4 animate-spin" />}
                30-day trial
              </Button>
              <Button variant="destructive" className="flex-1" disabled={!!busy} onClick={() => act('cancel')}>
                {busy === 'cancel' && <Loader2 className="w-4 h-4 animate-spin" />}
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
