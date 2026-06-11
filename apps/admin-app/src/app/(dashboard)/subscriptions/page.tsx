'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ManageSubscriptionDialog } from '@/components/subscriptions/manage-subscription-dialog';
import { formatPaise } from '@/lib/subscription-pricing';

interface SubRow {
  institute_id: string;
  institute_name: string;
  is_active_subscriber: boolean;
  subscription_status: string;
  canteen_count: number;
  student_count: number;
  subscription: {
    status?: string;
    billing_cycle?: string;
    plan_code?: string;
    subtotal_paise?: number;
    total_paise?: number;
    current_period_end?: string;
  } | null;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  active: 'success',
  trialing: 'warning',
  past_due: 'warning',
  expired: 'danger',
  cancelled: 'default',
};

const monthsOf = (cycle?: string) => (cycle === 'annual' ? 12 : cycle === 'biannual' ? 6 : 1);

export default function SubscriptionsPage() {
  const [manage, setManage] = useState<SubRow | null>(null);

  const { data, isLoading, refetch } = useQuery<{ data: SubRow[] }>({
    queryKey: ['subscriptions'],
    queryFn: () => axios.get('/api/v1/admin/subscriptions').then((r) => r.data),
  });

  const rows = data?.data ?? [];

  const mrrPaise = rows.reduce((sum, r) => {
    const s = r.subscription;
    if (s?.status === 'active' && s.subtotal_paise) {
      return sum + Math.round(s.subtotal_paise / monthsOf(s.billing_cycle));
    }
    return sum;
  }, 0);
  const activeCount = rows.filter((r) => r.subscription?.status === 'active').length;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-text">Subscriptions</h2>
        <p className="text-sm text-text-3">Manage institute subscriptions and billing.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Institutes" value={String(rows.length)} />
        <SummaryCard label="Active subscribers" value={String(activeCount)} />
        <SummaryCard label="MRR (pre-GST)" value={formatPaise(mrrPaise)} />
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr>
              {['Institute', 'Canteens', 'Students', 'Plan', 'Cycle', 'Status', 'Renews', ''].map((h, i) => (
                <th
                  key={i}
                  className="h-10 px-4 text-left text-xs font-semibold text-text-3 uppercase tracking-wide bg-bg-2 border-b border-border"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-text-3">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-text-3">
                  No institutes yet
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const s = r.subscription;
                return (
                  <tr key={r.institute_id} className="border-b border-border last:border-0 hover:bg-bg-2 transition-colors">
                    <td className="px-4 py-3 font-medium text-text">{r.institute_name}</td>
                    <td className="px-4 py-3 text-text-2">{r.canteen_count}</td>
                    <td className="px-4 py-3 text-text-2">{r.student_count.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-text-2 capitalize">{s?.plan_code ?? '—'}</td>
                    <td className="px-4 py-3 text-text-2 capitalize">{s?.billing_cycle ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[s?.status ?? ''] ?? 'default'}>{s?.status ?? 'none'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-3">
                      {s?.current_period_end ? new Date(s.current_period_end).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => setManage(r)}>
                        Manage
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {manage && (
        <ManageSubscriptionDialog row={manage} onClose={() => setManage(null)} onDone={() => refetch()} />
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface rounded-xl border border-border p-4">
      <p className="text-xs text-text-3">{label}</p>
      <p className="text-xl font-bold text-text mt-1">{value}</p>
    </div>
  );
}
