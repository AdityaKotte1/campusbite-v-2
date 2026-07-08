'use client';

import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Plus, Trash2, Loader2, Search, Users, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatDate, initials } from '@/lib/formatting';
import { useScopeStore } from '@/store/scope-store';
import type { Canteen, User } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffUser extends User {
  canteens?: {
    id: string;
    name: string;
    code: string;
  } | null;
}

// ─── Zod schema ───────────────────────────────────────────────────────────────

const addStaffSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  canteen_id: z.string().min(1, 'Select a canteen'),
});

type AddStaffForm = z.infer<typeof addStaffSchema>;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StaffPage() {
  const [showDialog, setShowDialog] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCanteenId, setFilterCanteenId] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { instituteId, canteenId } = useScopeStore();

  // Fetch staff list
  const { data: staffData, isLoading: staffLoading } = useQuery<{ data: StaffUser[] }>({
    queryKey: ['staff', instituteId, canteenId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (instituteId) params.institute_id = instituteId;
      if (canteenId) params.canteen_id = canteenId;
      const { data } = await axios.get('/api/v1/admin/staff', { params });
      return data;
    },
  });

  // Fetch canteens for the filter dropdown
  const { data: canteensData } = useQuery<{ data: Canteen[] }>({
    queryKey: ['canteens', instituteId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (instituteId) params.institute_id = instituteId;
      const { data } = await axios.get('/api/v1/admin/canteens', { params });
      return data;
    },
  });

  const staff = staffData?.data ?? [];
  const canteens = canteensData?.data ?? [];

  // Client-side filter
  const filtered = useMemo(() => {
    let list = staff;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (s) =>
          s.full_name?.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q)
      );
    }
    if (filterCanteenId) {
      list = list.filter((s) => s.assigned_canteen_id === filterCanteenId);
    }
    return list;
  }, [staff, search, filterCanteenId]);

  const handleRemove = async (staffMember: StaffUser) => {
    if (!confirm(`Remove ${staffMember.full_name ?? staffMember.email} from staff?`)) return;
    setRemovingId(staffMember.id);
    try {
      await axios.delete(`/api/v1/admin/staff?user_id=${staffMember.id}`);
      queryClient.invalidateQueries({ queryKey: ['staff'] });
    } catch {
      alert('Failed to remove staff member. Please try again.');
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          {/* Search */}
          <div className="relative w-full sm:w-auto sm:flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3" />
            <Input
              className="pl-9"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Canteen filter */}
          <select
            value={filterCanteenId}
            onChange={(e) => setFilterCanteenId(e.target.value)}
            aria-label="Filter by canteen"
            className="w-full sm:w-auto h-9 px-3 rounded-lg border border-border-2 bg-surface text-sm text-text hover:border-text-3 focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
          >
            <option value="">All Canteens</option>
            {canteens.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <Button onClick={() => setShowDialog(true)}>
          <Plus className="w-4 h-4" />
          Add Staff Member
        </Button>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr>
              {['Staff Member', 'Role', 'Assigned Canteen', 'Joined', 'Status', 'Actions'].map((h) => (
                <th
                  key={h}
                  className="h-10 px-5 text-left text-xs font-semibold text-text-3 uppercase tracking-wide bg-bg-2 border-b border-border"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {staffLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array(6)
                    .fill(0)
                    .map((_, j) => (
                      <td key={j} className="px-5 py-3 border-b border-border">
                        <div className="h-4 bg-bg-2 rounded animate-pulse" />
                      </td>
                    ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-full bg-bg-2 flex items-center justify-center">
                      <Users className="w-6 h-6 text-text-3" />
                    </div>
                    <p className="font-display text-lg font-semibold tracking-tight text-text">
                      {search || filterCanteenId ? 'No staff match your filters' : 'No staff members yet'}
                    </p>
                    {!search && !filterCanteenId && (
                      <p className="text-sm text-text-3">Add a staff member to get started.</p>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-border last:border-0 hover:bg-bg-2 transition-colors"
                >
                  {/* Avatar + Name */}
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-brand-pale text-brand flex items-center justify-center font-display text-xs font-semibold shrink-0">
                        {initials(s.full_name)}
                      </div>
                      <div>
                        <p className="font-medium text-text">{s.full_name ?? '—'}</p>
                        <p className="text-xs text-text-3">{s.email}</p>
                      </div>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-5 py-3">
                    <Badge variant="info" className="capitalize">
                      {s.role}
                    </Badge>
                  </td>

                  {/* Canteen */}
                  <td className="px-5 py-3 text-text-2">
                    {s.canteens?.name ?? '—'}
                  </td>

                  {/* Joined */}
                  <td className="px-5 py-3 text-xs text-text-3">
                    {formatDate(s.created_at)}
                  </td>

                  {/* Status */}
                  <td className="px-5 py-3">
                    <Badge variant={s.is_active ? 'success' : 'danger'} className="gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${s.is_active ? 'bg-green' : 'bg-text-3'}`} />
                      {s.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-3">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => handleRemove(s)}
                      disabled={removingId === s.id}
                      title="Remove staff"
                    >
                      {removingId === s.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Add Staff Dialog */}
      {showDialog && (
        <AddStaffDialog
          canteens={canteens}
          onClose={() => setShowDialog(false)}
          onSuccess={() => {
            setShowDialog(false);
            queryClient.invalidateQueries({ queryKey: ['staff'] });
          }}
        />
      )}
    </div>
  );
}

// ─── Add Staff Dialog ─────────────────────────────────────────────────────────

function AddStaffDialog({
  canteens,
  onClose,
  onSuccess,
}: {
  canteens: Canteen[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AddStaffForm>({ resolver: zodResolver(addStaffSchema) });

  const [serverError, setServerError] = useState('');

  const onSubmit = async (values: AddStaffForm) => {
    setServerError('');
    try {
      await axios.post('/api/v1/admin/staff', {
        email: values.email,
        canteen_id: values.canteen_id,
      });
      onSuccess();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error?.message ?? 'Failed to add staff member'
        : 'Unknown error';
      setServerError(msg);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-surface rounded-2xl border border-border shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between">
          <div>
            <p className="eyebrow">Team</p>
            <h2 className="font-display text-lg font-semibold tracking-tight text-text">Add Staff Member</h2>
          </div>
          <button
            onClick={onClose}
            className="text-text-3 hover:text-text transition rounded-lg p-1 hover:bg-bg-2"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          {serverError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {serverError}
            </p>
          )}

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">
              User Email <span className="text-red-500">*</span>
            </label>
            <Input
              {...register('email')}
              type="email"
              placeholder="staff@example.com"
              error={!!errors.email}
            />
            <p className="mt-1 text-xs text-text-3">
              The user must already have a student account.
            </p>
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          {/* Canteen dropdown */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">
              Assign to Canteen <span className="text-red-500">*</span>
            </label>
            <select
              {...register('canteen_id')}
              className={`w-full h-9 px-3 rounded-lg border bg-surface text-sm text-text hover:border-text-3 focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all ${
                errors.canteen_id ? 'border-red-400' : 'border-border-2'
              }`}
              defaultValue=""
            >
              <option value="" disabled>
                Select a canteen…
              </option>
              {canteens.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.canteen_id && (
              <p className="mt-1 text-xs text-red-600">{errors.canteen_id.message}</p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Staff Member
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
