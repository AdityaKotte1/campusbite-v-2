'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatPaise, studentTierLabel, type BillingCycle } from '@/lib/subscription-pricing';

interface Quote {
  cycle: BillingCycle;
  months: number;
  discountPct: number;
  monthlyBasePaise: number;
  subtotalPaise: number;
  gstPaise: number;
  totalPaise: number;
}
interface MeData {
  institute: { id: string; name: string } | null;
  canteens: number;
  students: number;
  subscription: { status?: string; billing_cycle?: string; current_period_end?: string; plan_code?: string } | null;
  invoices: Array<{ id: string; billing_cycle: string; total_paise: number; status: string; period_end: string; created_at: string }>;
  quotes: Quote[];
  razorpay_enabled: boolean;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  active: 'success',
  trialing: 'warning',
  past_due: 'warning',
  expired: 'danger',
  cancelled: 'default',
};

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function BillingPage() {
  const [cycle, setCycle] = useState<BillingCycle>('annual');
  const [paying, setPaying] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const { data, isLoading, refetch } = useQuery<{ data: MeData }>({
    queryKey: ['billing-me'],
    queryFn: () => axios.get('/api/v1/admin/subscriptions/me').then((r) => r.data),
  });
  const me = data?.data;
  const quote = me?.quotes.find((q) => q.cycle === cycle);

  const pay = useCallback(async () => {
    setMsg(null);
    setPaying(true);
    try {
      const ok = await loadRazorpay();
      if (!ok) throw new Error('Could not load the payment gateway');

      const { data: co } = await axios.post('/api/v1/admin/subscriptions/checkout', { cycle });
      const order = co.data;

      await new Promise<void>((resolve, reject) => {
        const RZP = (window as unknown as { Razorpay: new (o: unknown) => { open: () => void } }).Razorpay;
        const rzp = new RZP({
          key: order.key_id,
          amount: order.amount,
          currency: order.currency,
          name: 'CampusBite',
          description: `${me?.institute?.name ?? 'Institute'} subscription (${cycle})`,
          order_id: order.order_id,
          theme: { color: '#E8390E' },
          handler: async (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            try {
              await axios.post('/api/v1/admin/subscriptions/verify', resp);
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
        });
        rzp.open();
      });

      setMsg({ type: 'success', text: 'Subscription activated. Thank you!' });
      refetch();
    } catch (e) {
      const text = axios.isAxiosError(e)
        ? e.response?.data?.error?.message ?? 'Payment failed'
        : (e as Error).message;
      setMsg({ type: 'error', text });
    } finally {
      setPaying(false);
    }
  }, [cycle, me, refetch]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-7 h-7 animate-spin text-text-3" />
      </div>
    );
  }
  if (!me) {
    return <div className="text-center py-20 text-text-3">Billing isn&apos;t available for this account.</div>;
  }

  const sub = me.subscription;
  const status = sub?.status ?? 'none';

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h2 className="text-lg font-bold text-text">Billing &amp; Subscription</h2>
        <p className="text-sm text-text-3">{me.institute?.name}</p>
      </div>

      {msg && (
        <div
          className={`flex items-start gap-2 p-3 rounded-xl border text-sm ${
            msg.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <AlertTriangle className="w-4 h-4 mt-0.5" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Current status */}
      <div className="bg-surface rounded-xl border border-border p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-text-3">Current status</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={STATUS_VARIANT[status] ?? 'default'}>{status}</Badge>
              {sub?.current_period_end && (
                <span className="text-sm text-text-2">
                  {status === 'expired' || status === 'cancelled' ? 'Ended' : 'Renews'}{' '}
                  {new Date(sub.current_period_end).toLocaleDateString('en-IN')}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-text-3">Usage</p>
            <p className="text-sm text-text mt-1">
              {me.canteens} canteen{me.canteens === 1 ? '' : 's'} · {me.students.toLocaleString('en-IN')} students
            </p>
            <p className="text-xs text-text-3">Tier: {studentTierLabel(me.students)}</p>
          </div>
        </div>
      </div>

      {/* Pay / renew */}
      <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
        <h3 className="text-sm font-semibold text-text">
          {status === 'active' ? 'Renew / change plan' : 'Activate subscription'}
        </h3>

        {!me.razorpay_enabled && (
          <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
            Online payment isn&apos;t enabled yet. Please contact CampusBite to activate.
          </p>
        )}

        {/* Cycle picker */}
        <div className="grid grid-cols-3 gap-2">
          {me.quotes.map((q) => (
            <button
              key={q.cycle}
              onClick={() => setCycle(q.cycle)}
              className={`p-3 rounded-lg border text-left transition ${
                cycle === q.cycle ? 'border-brand bg-brand-pale' : 'border-border hover:bg-bg'
              }`}
            >
              <p className="text-xs font-semibold text-text">
                {q.cycle === 'monthly' ? 'Monthly' : q.cycle === 'biannual' ? '6 Months' : 'Annual'}
              </p>
              <p className="text-sm font-bold text-text mt-1">{formatPaise(q.totalPaise)}</p>
              {q.discountPct > 0 && <p className="text-[11px] text-green">{Math.round(q.discountPct * 100)}% off</p>}
            </button>
          ))}
        </div>

        {/* Breakdown */}
        {quote && (
          <div className="bg-bg rounded-lg border border-border p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-text-2">
                Base ({me.canteens} × ₹2,000{quote.monthlyBasePaise > me.canteens * 200000 ? ' + student tier' : ''}) × {quote.months} mo
              </span>
              <span>{formatPaise(quote.monthlyBasePaise * quote.months)}</span>
            </div>
            {quote.discountPct > 0 && (
              <div className="flex justify-between text-green">
                <span>Discount ({Math.round(quote.discountPct * 100)}%)</span>
                <span>-{formatPaise(quote.monthlyBasePaise * quote.months - quote.subtotalPaise)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-text-2">GST (18%)</span>
              <span>{formatPaise(quote.gstPaise)}</span>
            </div>
            <div className="flex justify-between font-bold pt-1 border-t border-border">
              <span>Total</span>
              <span>{formatPaise(quote.totalPaise)}</span>
            </div>
          </div>
        )}

        <Button className="w-full" disabled={paying || !me.razorpay_enabled} onClick={pay}>
          {paying && <Loader2 className="w-4 h-4 animate-spin" />}
          Pay {quote ? formatPaise(quote.totalPaise) : ''}
        </Button>
      </div>

      {/* Invoices */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-text">Invoices</h3>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {me.invoices.length === 0 ? (
              <tr>
                <td className="px-5 py-6 text-center text-text-3">No invoices yet</td>
              </tr>
            ) : (
              me.invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 text-text-2">{new Date(inv.created_at).toLocaleDateString('en-IN')}</td>
                  <td className="px-5 py-3 text-text-2 capitalize">{inv.billing_cycle}</td>
                  <td className="px-5 py-3 text-text font-medium">{formatPaise(inv.total_paise)}</td>
                  <td className="px-5 py-3 text-right">
                    <Badge variant={inv.status === 'paid' ? 'success' : inv.status === 'pending' ? 'warning' : 'default'}>
                      {inv.status}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
