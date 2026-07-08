'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { type ColumnDef } from '@tanstack/react-table';
import { Eye, Download, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { DataTable } from '@/components/ui/data-table';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { StatusUpdateButton } from '@/components/orders/status-update-button';
import { PrepBoard } from '@/components/orders/prep-board';
import { ForecastBoard } from '@/components/orders/forecast-board';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatDateTime } from '@/lib/formatting';
import { ORDER_STATUS_LABELS } from '@/lib/constants';
import { useScopeStore } from '@/store/scope-store';
import { useAuthStore } from '@/store/auth-store';
import type { Order, OrderStatus } from '@/types';

type BoardCanteen = { id: string; name: string };

const STATUS_OPTIONS = ['all', 'confirmed', 'preparing', 'ready', 'collected', 'cancelled', 'refunded'];

function buildColumns(onUpdateStatus: (id: string, status: string) => Promise<void>): ColumnDef<Order>[] {
  return [
    {
      accessorKey: 'order_number',
      header: 'Order #',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-text-2">{row.original.order_number}</span>
      ),
    },
    {
      id: 'customer',
      header: 'Customer',
      cell: ({ row }) => (
        <span className="text-sm text-text">
          {row.original.user?.full_name ?? row.original.user?.email ?? '—'}
        </span>
      ),
    },
    {
      id: 'canteen',
      header: 'Canteen',
      cell: ({ row }) => (
        <span className="text-sm text-text-2">{row.original.canteen?.name ?? '—'}</span>
      ),
    },
    {
      id: 'items',
      header: 'Items',
      cell: ({ row }) => (
        <span className="text-sm text-text-2">
          {row.original.order_items?.length ?? 0} items
        </span>
      ),
    },
    {
      accessorKey: 'total_paise',
      header: 'Amount',
      cell: ({ row }) => (
        <span className="text-sm font-medium text-text">
          {formatCurrency(row.original.total_paise)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <OrderStatusBadge status={row.original.status} />
          {/* Only super admins ever receive hidden rows (they're filtered out
              server-side for everyone else), so this badge is safe to show
              whenever hidden_at is set. */}
          {row.original.hidden_at && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-bg-2 text-text-3 border border-border"
              title="A canteen admin hid this order from their history view"
            >
              Hidden
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Time',
      cell: ({ row }) => (
        <span className="text-xs text-text-3">{formatDateTime(row.original.created_at)}</span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Link href={`/orders/${row.original.id}`}>
            <Button variant="ghost" size="icon-sm" title="View">
              <Eye className="w-4 h-4" />
            </Button>
          </Link>
          <StatusUpdateButton
            orderId={row.original.id}
            currentStatus={row.original.status as OrderStatus}
            onUpdate={onUpdateStatus}
          />
        </div>
      ),
    },
  ];
}

export default function OrdersPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [boardCanteen, setBoardCanteen] = useState<string | null>(null);
  // Identifies the exact set of orders the admin last exported to CSV. Deletion
  // is only unlocked while this matches what's currently on screen, so an admin
  // can never delete history they haven't first downloaded a copy of.
  const [exportedKey, setExportedKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const queryClient = useQueryClient();
  const { instituteId, canteenId } = useScopeStore();
  const user = useAuthStore((s) => s.user);
  const role = (user as { role?: string } | null)?.role ?? '';

  // Role-scoped canteens the caller can access. For staff this is just their
  // assigned canteen; for canteen_admin their institute's canteens. super_admin
  // uses the scope selector instead, so we only need this for non-super-admins.
  const { data: canteensData } = useQuery<{ data: BoardCanteen[] }>({
    queryKey: ['board-canteens'],
    queryFn: () => axios.get('/api/v1/admin/canteens').then((r) => r.data),
    enabled: role !== '' && role !== 'super_admin',
  });
  const canteens = canteensData?.data ?? [];

  // Effective canteen the boards should display:
  //   super_admin → the scope selector value (may be null → "select a canteen").
  //   others      → explicit picker choice, or auto-select when only one canteen.
  const effectiveBoardCanteen =
    role === 'super_admin'
      ? canteenId
      : boardCanteen ?? (canteens.length === 1 ? canteens[0].id : null);

  const { data, isLoading } = useQuery<{ data: Order[] }>({
    queryKey: ['orders', statusFilter, dateFrom, dateTo, instituteId, canteenId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (instituteId) params.institute_id = instituteId;
      if (canteenId) params.canteen_id = canteenId;
      const { data } = await axios.get('/api/v1/admin/orders', { params });
      return data;
    },
    refetchInterval: 30 * 1000,
  });

  const orders = data?.data ?? [];

  const handleUpdateStatus = useCallback(
    async (orderId: string, newStatus: string) => {
      await axios.put(`/api/v1/admin/orders/${orderId}/status`, { status: newStatus });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    [queryClient]
  );

  const columns = buildColumns(handleUpdateStatus);

  const filtered = search
    ? orders.filter(
        (o) =>
          o.order_number.toLowerCase().includes(search.toLowerCase()) ||
          o.user?.email?.toLowerCase().includes(search.toLowerCase()) ||
          o.user?.full_name?.toLowerCase().includes(search.toLowerCase())
      )
    : orders;

  // Stable signature of the rows currently shown. Exporting stamps this; the
  // delete button only unlocks while the signature still matches (i.e. the admin
  // is deleting exactly what they exported, before any filter/data change).
  const currentKey = filtered
    .map((o) => o.id)
    .sort()
    .join(',');

  // Only canteen admins may hide history from their view. Super admins are
  // view-only (they always see every order, hidden ones badged); staff cannot.
  const canDeleteHistory = role === 'canteen_admin';
  const deleteUnlocked =
    canDeleteHistory && filtered.length > 0 && exportedKey === currentKey;

  // Build the CSV from exactly what's on screen, escaping every field so commas
  // and quotes in names/instructions can't corrupt the columns.
  const buildCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = [
      ['Order #', 'Customer', 'Canteen', 'Items', 'Amount (₹)', 'Status', 'Time'],
      ...filtered.map((o) => [
        o.order_number,
        o.user?.full_name ?? o.user?.email ?? '',
        o.canteen?.name ?? '',
        String(o.order_items?.length ?? 0),
        String(o.total_paise / 100),
        o.status,
        o.created_at,
      ]),
    ];
    return rows.map((r) => r.map((c) => esc(String(c))).join(',')).join('\n');
  };

  const handleExportCSV = () => {
    if (filtered.length === 0) return;
    const csv = buildCsv();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    // Unlock deletion of this exact set now that a copy has been saved.
    setExportedKey(currentKey);
  };

  const handleDeleteHistory = async () => {
    if (!deleteUnlocked) return;
    const ids = filtered.map((o) => o.id);
    if (
      !confirm(
        `Hide ${ids.length} order${ids.length === 1 ? '' : 's'} from your history?\n\n` +
          'The order data is preserved and stays visible to the super admin — this only ' +
          'removes it from your list. Make sure you have saved the CSV you just downloaded.'
      )
    )
      return;
    setDeleting(true);
    try {
      await axios.delete('/api/v1/admin/orders', { data: { ids } });
      setExportedKey(null);
      // The dashboard's "Recent Orders" reads the same orders table under a
      // different query key, so refresh it too (and any other order-derived views).
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      // Surface the server's actual reason instead of a generic message.
      const serverMessage = axios.isAxiosError(err)
        ? (err.response?.data as { error?: { message?: string } } | undefined)?.error?.message
        : undefined;
      alert(serverMessage ?? 'Failed to hide order history. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order # or customer…"
            className="pl-9"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 w-full sm:w-auto px-3 rounded-lg border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All Statuses' : ORDER_STATUS_LABELS[s] ?? s}
            </option>
          ))}
        </select>

        <div className="flex w-full sm:w-auto items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="flex-1 min-w-0 sm:w-36 sm:flex-none"
          />
          <span className="text-text-3 text-sm">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="flex-1 min-w-0 sm:w-36 sm:flex-none"
          />
        </div>

        <Button
          variant="outline"
          size="md"
          onClick={handleExportCSV}
          disabled={filtered.length === 0}
          className="w-full sm:w-auto"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </Button>

        {canDeleteHistory && (
          <Button
            variant="destructive"
            size="md"
            onClick={handleDeleteHistory}
            disabled={!deleteUnlocked || deleting}
            className="w-full sm:w-auto"
            title={
              deleteUnlocked
                ? `Hide ${filtered.length} order(s) from your history (data is kept)`
                : 'Export the CSV first to enable hiding'
            }
          >
            <Trash2 className="w-4 h-4" />
            {deleting ? 'Hiding…' : `Hide History${deleteUnlocked ? ` (${filtered.length})` : ''}`}
          </Button>
        )}
      </div>

      {/* Prep + Forecast boards */}
      {role !== 'super_admin' && canteens.length > 1 && (
        <select
          value={boardCanteen ?? ''}
          onChange={(e) => setBoardCanteen(e.target.value || null)}
          className="h-9 w-full sm:w-auto px-3 rounded-lg border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="">Select a canteen…</option>
          {canteens.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <div className="grid gap-5 md:grid-cols-2">
        <PrepBoard canteenId={effectiveBoardCanteen} />
        <ForecastBoard canteenId={effectiveBoardCanteen} />
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        emptyMessage="No orders found."
        globalFilter={search}
        onGlobalFilterChange={setSearch}
      />
    </div>
  );
}
