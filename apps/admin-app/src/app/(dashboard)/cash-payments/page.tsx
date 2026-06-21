'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useScopeStore } from '@/store/scope-store';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDateTime } from '@/lib/formatting';

type CashOrder = {
  id: string; order_number: string; total_paise: number; created_at: string;
  user?: { full_name?: string; phone?: string } | null;
  canteen?: { name?: string } | null;
  order_items?: unknown[];
};

export default function CashPaymentsPage() {
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
  const approve = async (id: string) => {
    await axios.post(`/api/v1/admin/orders/${id}/approve-cash`);
    qc.invalidateQueries({ queryKey: ['cash-orders'] });
  };
  const rows = data?.data ?? [];
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Cash Payments</h1>
      <p className="text-sm text-text-3">Approve cash orders after collecting payment. The order is then confirmed and the student&apos;s pickup QR unlocks — they collect at the kiosk like an online order.</p>
      {isLoading ? (
        <p className="text-text-3 text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-text-3 text-sm">No pending cash orders.</p>
      ) : (
        <div className="bg-surface rounded-xl border border-border divide-y divide-border">
          {rows.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="flex-1 min-w-0">
                <p className="font-mono text-xs text-text-3">{o.order_number}</p>
                <p className="text-sm font-medium text-text">
                  {o.user?.full_name ?? '—'}
                  {o.canteen?.name ? ` · ${o.canteen.name}` : ''}
                </p>
                <p className="text-xs text-text-3">{formatDateTime(o.created_at)}</p>
              </div>
              <div className="text-sm font-semibold text-text">{formatCurrency(o.total_paise)}</div>
              <Button onClick={() => approve(o.id)}>Approve</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
