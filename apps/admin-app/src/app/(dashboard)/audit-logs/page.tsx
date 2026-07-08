'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { type ColumnDef } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatDateTime, initials } from '@/lib/formatting';
import type { AuditLog } from '@/types';

const ACTION_VARIANTS: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'default'> = {
  create: 'success',
  update: 'info',
  delete: 'danger',
  login: 'default',
  logout: 'default',
  status_change: 'warning',
};

const columns: ColumnDef<AuditLog>[] = [
  {
    id: 'user',
    header: 'User',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-bg-2 border border-border text-text-3 flex items-center justify-center text-xs font-semibold">
          {initials(row.original.user?.full_name ?? row.original.user?.email)}
        </div>
        <div>
          <p className="text-xs font-medium text-text">{row.original.user?.full_name ?? '—'}</p>
          <p className="text-xs text-text-3">{row.original.user?.email ?? 'System'}</p>
        </div>
      </div>
    ),
  },
  {
    accessorKey: 'action',
    header: 'Action',
    cell: ({ row }) => {
      const actionKey = row.original.action.split('.').pop() ?? row.original.action;
      return (
        <Badge variant={ACTION_VARIANTS[actionKey] ?? 'default'} className="font-mono">
          {row.original.action}
        </Badge>
      );
    },
  },
  {
    id: 'entity',
    header: 'Entity',
    cell: ({ row }) => (
      <div>
        <p className="text-xs font-medium text-text-2 capitalize">
          {row.original.entity_type ?? '—'}
        </p>
        {row.original.entity_id && (
          <p className="font-mono text-xs text-text-3 tabular-nums">{row.original.entity_id.slice(0, 8)}…</p>
        )}
      </div>
    ),
  },
  {
    accessorKey: 'ip_address',
    header: 'IP Address',
    cell: ({ row }) => (
      <span className="font-mono text-xs text-text-3 tabular-nums">{row.original.ip_address ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'created_at',
    header: 'Timestamp',
    cell: ({ row }) => (
      <span className="text-xs text-text-3 tabular-nums">{formatDateTime(row.original.created_at)}</span>
    ),
  },
];

export default function AuditLogsPage() {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading } = useQuery<{ data: AuditLog[] }>({
    queryKey: ['audit-logs', actionFilter, dateFrom, dateTo],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (actionFilter) params.action = actionFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const { data } = await axios.get('/api/v1/admin/audit-logs', { params });
      return data;
    },
  });

  const logs = data?.data ?? [];

  const filtered = search
    ? logs.filter(
        (l) =>
          l.action.toLowerCase().includes(search.toLowerCase()) ||
          l.user?.email?.toLowerCase().includes(search.toLowerCase()) ||
          l.ip_address?.includes(search)
      )
    : logs;

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user, action, IP…"
            className="pl-9"
          />
        </div>
        <Input
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          placeholder="Filter by action…"
          className="w-full sm:w-48"
        />
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="flex-1 sm:flex-none sm:w-36" />
        <span className="text-text-3 text-sm">to</span>
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="flex-1 sm:flex-none sm:w-36" />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        emptyMessage="No audit logs found."
      />
    </div>
  );
}
