'use client';

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { type ColumnDef } from '@tanstack/react-table';
import { Eye, Download, Search } from 'lucide-react';
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
import type { Order, OrderStatus } from '@/types';

const STATUS_OPTIONS = ['all', 'payment_pending', 'confirmed', 'preparing', 'ready', 'collected', 'cancelled', 'refunded'];

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
      cell: ({ row }) => <OrderStatusBadge status={row.original.status} />,
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
  const queryClient = useQueryClient();
  const { instituteId, canteenId } = useScopeStore();

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

  const handleExportCSV = () => {
    const rows = [
      ['Order #', 'Customer', 'Canteen', 'Items', 'Amount (₹)', 'Status', 'Time'],
      ...orders.map((o) => [
        o.order_number,
        o.user?.full_name ?? o.user?.email ?? '',
        o.canteen?.name ?? '',
        String(o.order_items?.length ?? 0),
        String(o.total_paise / 100),
        o.status,
        o.created_at,
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const filtered = search
    ? orders.filter(
        (o) =>
          o.order_number.toLowerCase().includes(search.toLowerCase()) ||
          o.user?.email?.toLowerCase().includes(search.toLowerCase()) ||
          o.user?.full_name?.toLowerCase().includes(search.toLowerCase())
      )
    : orders;

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
          className="h-9 px-3 rounded-lg border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'All Statuses' : ORDER_STATUS_LABELS[s] ?? s}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-36"
          />
          <span className="text-text-3 text-sm">to</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-36"
          />
        </div>

        <Button variant="outline" size="md" onClick={handleExportCSV}>
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Prep + Forecast boards */}
      <div className="grid gap-5 md:grid-cols-2">
        <PrepBoard canteenId={canteenId} />
        <ForecastBoard canteenId={canteenId} />
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
