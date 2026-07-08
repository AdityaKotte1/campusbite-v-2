'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useScopeStore } from '@/store/scope-store';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatDateTime } from '@/lib/formatting';

type CashOrder = {
  id: string; order_number: string; total_paise: number; created_at: string;
  user?: { full_name?: string; phone?: string } | null;
  canteen?: { name?: string } | null;
};

type CashHistoryRow = {
  id: string; order_number: string; total_paise: number;
  created_at: string; approved_at: string | null;
  customer_name: string | null; customer_phone: string | null;
  canteen_name: string | null; approved_by_name: string;
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return isoDay(d); };

export default function CashPaymentsPage() {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const role = useAuthStore((s) => s.user?.role);
  // History/audit is for canteen_admin + super_admin only — staff don't see it.
  const canSeeHistory = role === 'super_admin' || role === 'canteen_admin';
  const tabs = canSeeHistory ? (['pending', 'history'] as const) : (['pending'] as const);
  const activeTab = tab === 'history' && !canSeeHistory ? 'pending' : tab;
  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl sm:text-2xl font-semibold tracking-tight">Cash Payments</h1>
      <div className="flex gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              activeTab === t ? 'border-text text-text' : 'border-transparent text-text-3 hover:text-text'
            }`}
          >
            {t === 'pending' ? 'Pending' : 'History'}
          </button>
        ))}
      </div>
      {activeTab === 'pending' ? <PendingTab /> : <HistoryTab />}
    </div>
  );
}

function PendingTab() {
  const { instituteId, canteenId } = useScopeStore();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ data: CashOrder[] }>({
    queryKey: ['cash-orders', instituteId, canteenId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (instituteId) params.institute_id = instituteId;
      if (canteenId) params.canteen_id = canteenId;
      return axios.get('/api/v1/admin/cash-orders', { params }).then((r) => r.data);
    },
    refetchInterval: 15000,
  });
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const approve = async (id: string) => {
    // Guard: ignore a double-click while this id is already in flight.
    if (approvingIds.has(id)) return;
    setApprovingIds((prev) => new Set(prev).add(id));
    setErrors((prev) => { const next = { ...prev }; delete next[id]; return next; });
    try {
      await axios.post(`/api/v1/admin/orders/${id}/approve-cash`);
      qc.invalidateQueries({ queryKey: ['cash-orders'] });
      qc.invalidateQueries({ queryKey: ['cash-history'] });
    } catch (e) {
      const msg = axios.isAxiosError(e)
        ? (e.response?.data?.error?.message ?? e.message)
        : 'Failed to approve. Please try again.';
      setErrors((prev) => ({ ...prev, [id]: msg }));
    } finally {
      setApprovingIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    }
  };
  const rows = data?.data ?? [];
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-3">Approve cash orders after collecting payment. The order is then confirmed and the student&apos;s pickup QR unlocks — they collect at the kiosk like an online order.</p>
      {isLoading ? (
        <p className="text-text-3 text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-text-3 text-sm">No pending cash orders.</p>
      ) : (
        <div className="bg-surface rounded-xl border border-border divide-y divide-border">
          {rows.map((o) => {
            const isApproving = approvingIds.has(o.id);
            return (
              <div key={o.id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs text-text-3">{o.order_number}</p>
                  <p className="text-sm font-medium text-text">
                    {o.user?.full_name ?? '—'}
                    {o.canteen?.name ? ` · ${o.canteen.name}` : ''}
                  </p>
                  <p className="text-xs text-text-3">{formatDateTime(o.created_at)}</p>
                  {errors[o.id] ? <p className="text-xs text-red-500 mt-1">{errors[o.id]}</p> : null}
                </div>
                <div className="text-sm font-semibold text-text">{formatCurrency(o.total_paise)}</div>
                <Button onClick={() => approve(o.id)} disabled={isApproving}>
                  {isApproving ? 'Approving…' : 'Approve'}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HistoryTab() {
  const { instituteId, canteenId } = useScopeStore();
  const [from, setFrom] = useState(() => daysAgo(30));
  const [to, setTo] = useState(() => isoDay(new Date()));

  const { data, isLoading } = useQuery<{ data: CashHistoryRow[] }>({
    queryKey: ['cash-history', instituteId, canteenId, from, to],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (instituteId) params.institute_id = instituteId;
      if (canteenId) params.canteen_id = canteenId;
      if (from) params.date_from = from;
      if (to) params.date_to = to;
      return axios.get('/api/v1/admin/cash-orders/history', { params }).then((r) => r.data);
    },
  });
  const rows = data?.data ?? [];

  const downloadCsv = () => {
    const header = ['Approved At', 'Order Number', 'Customer', 'Phone', 'Canteen', 'Amount (₹)', 'Approved By'];
    const cell = (v: string | number | null) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = rows.map((r) => [
      r.approved_at ? formatDateTime(r.approved_at) : '',
      r.order_number,
      r.customer_name ?? '',
      r.customer_phone ?? '',
      r.canteen_name ?? '',
      (r.total_paise / 100).toFixed(2),
      r.approved_by_name,
    ].map(cell).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cash-approvals_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-3">Approved cash payments. Each row is an approval — who approved it, for which order, and when.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-text-3">From
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="mt-1 block" />
        </label>
        <label className="text-xs text-text-3">To
          <Input type="date" value={to} min={from} max={isoDay(new Date())} onChange={(e) => setTo(e.target.value)} className="mt-1 block" />
        </label>
        <Button variant="secondary" onClick={downloadCsv} disabled={rows.length === 0}>
          Download CSV
        </Button>
      </div>
      {isLoading ? (
        <p className="text-text-3 text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-text-3 text-sm">No approved cash payments in this range.</p>
      ) : (
        <div className="bg-surface rounded-xl border border-border overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs text-text-3 border-b border-border">
                <th className="p-3 font-medium">Approved At</th>
                <th className="p-3 font-medium">Order</th>
                <th className="p-3 font-medium">Customer</th>
                <th className="p-3 font-medium">Canteen</th>
                <th className="p-3 font-medium text-right">Amount</th>
                <th className="p-3 font-medium">Approved By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="p-3 text-text-3 whitespace-nowrap">{r.approved_at ? formatDateTime(r.approved_at) : '—'}</td>
                  <td className="p-3 font-mono text-xs text-text-3 whitespace-nowrap">{r.order_number}</td>
                  <td className="p-3 text-text">{r.customer_name ?? '—'}</td>
                  <td className="p-3 text-text">{r.canteen_name ?? '—'}</td>
                  <td className="p-3 text-right font-semibold text-text whitespace-nowrap">{formatCurrency(r.total_paise)}</td>
                  <td className="p-3 text-text">{r.approved_by_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
