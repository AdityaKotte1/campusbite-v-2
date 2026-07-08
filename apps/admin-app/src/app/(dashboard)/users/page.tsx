'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { type ColumnDef } from '@tanstack/react-table';
import { Search, UserX, UserCheck } from 'lucide-react';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate, formatRelativeTime, initials } from '@/lib/formatting';
import { ROLE_LABELS } from '@/lib/constants';
import { useAuthStore } from '@/store/auth-store';
import type { User, Institute } from '@/types';

const ROLE_OPTIONS = ['all', 'canteen_admin', 'staff', 'student'];
const SUPER_ADMIN_ROLE_OPTIONS = ['all', 'super_admin', 'canteen_admin', 'staff', 'student'];

function buildColumns(onToggleActive: (user: User) => void, institutesMap: Record<string, string>): ColumnDef<User>[] {
  return [
    {
      id: 'user',
      header: 'User',
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-brand-pale text-brand flex items-center justify-center font-display text-xs font-semibold shrink-0">
            {initials(row.original.full_name)}
          </div>
          <div>
            <p className="text-sm font-medium text-text">{row.original.full_name ?? '—'}</p>
            <p className="text-xs text-text-3">{row.original.email}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => (
        <Badge variant={row.original.role === 'super_admin' ? 'purple' : 'default'}>
          {ROLE_LABELS[row.original.role] ?? row.original.role}
        </Badge>
      ),
    },
    {
      id: 'institute',
      header: 'Institute',
      cell: ({ row }) => (
        <span className="text-sm text-text-2">
          {row.original.institute_id ? (institutesMap[row.original.institute_id] ?? row.original.institute_id) : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Joined',
      cell: ({ row }) => (
        <span className="text-xs text-text-3">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      id: 'last_login',
      header: 'Last Login',
      cell: ({ row }) => (
        <span className="text-xs text-text-3">
          {row.original.last_login_at ? formatRelativeTime(row.original.last_login_at) : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'success' : 'danger'} className="gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${row.original.is_active ? 'bg-green' : 'bg-red-500'}`} />
          {row.original.is_active ? 'Active' : 'Suspended'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onToggleActive(row.original)}
          title={row.original.is_active ? 'Suspend user' : 'Activate user'}
          className={row.original.is_active ? 'text-red-500 hover:text-red-600 hover:bg-red-50' : 'text-green hover:bg-green-light'}
        >
          {row.original.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
        </Button>
      ),
    },
  ];
}

export default function UsersPage() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const queryClient = useQueryClient();
  const { user: authUser } = useAuthStore();
  const isSuperAdmin = (authUser as { role?: string } | null)?.role === 'super_admin';

  const { data, isLoading } = useQuery<{ data: User[] }>({
    queryKey: ['users', roleFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (roleFilter !== 'all') params.role = roleFilter;
      const { data } = await axios.get('/api/v1/admin/users', { params });
      return data;
    },
  });

  // Fetch institutes to resolve institute_id → name
  const { data: institutesData } = useQuery<{ data: Institute[] }>({
    queryKey: ['institutes'],
    queryFn: () => axios.get('/api/v1/admin/institutes').then((r) => r.data),
  });
  const institutesMap: Record<string, string> = {};
  (institutesData?.data ?? []).forEach((inst) => {
    institutesMap[inst.id] = inst.name;
  });

  // Defense in depth: never render super_admins in the users table.
  const users = (data?.data ?? []).filter((u) => u.role !== 'super_admin');

  const handleToggleActive = async (user: User) => {
    await axios.put(`/api/v1/admin/users/${user.id}`, { is_active: !user.is_active });
    queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const columns = buildColumns(handleToggleActive, institutesMap);
  const roleOptions = isSuperAdmin ? SUPER_ADMIN_ROLE_OPTIONS : ROLE_OPTIONS;

  const filtered = search
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          u.full_name?.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-auto sm:flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="pl-9"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Filter by role"
          className="w-full sm:w-auto h-9 px-3 rounded-lg border border-border-2 bg-surface text-sm text-text hover:border-text-3 focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
        >
          {roleOptions.map((r) => (
            <option key={r} value={r}>
              {r === 'all' ? 'All Roles' : ROLE_LABELS[r] ?? r}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        emptyMessage="No users found."
        globalFilter={search}
      />
    </div>
  );
}
