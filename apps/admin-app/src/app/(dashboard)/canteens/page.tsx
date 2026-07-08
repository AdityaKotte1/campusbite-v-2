'use client';

import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  Pencil, PowerOff, Power, ToggleLeft, ToggleRight, Loader2,
  Store, Clock, MapPin, Upload, ImageIcon, ChevronDown, Plus, X,
  CreditCard, Trash2, AlertTriangle, Banknote, Percent,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/auth-store';
import type { Canteen, Institute } from '@/types';
import { AddCanteenDialog } from '@/components/canteens/add-canteen-dialog';
import { payAndVerify } from '@/lib/razorpay-checkout';

// ─── Types ────────────────────────────────────────────────────────────────────

type CanteenWithStats = Canteen & {
  today_orders?: number;
  today_revenue_paise?: number;
};

// ─── Edit schema ─────────────────────────────────────────────────────────────

const editSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  location: z.string().min(1, 'Location is required'),
  opening_time: z.string().min(1, 'Opening time required'),
  closing_time: z.string().min(1, 'Closing time required'),
  description: z.string().optional(),
});

type EditForm = z.infer<typeof editSchema>;

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CanteensPage() {
  const { user } = useAuthStore();
  const role = (user as { role?: string } | null)?.role ?? '';
  const isSuperAdmin = role === 'super_admin';

  const [selectedInstituteId, setSelectedInstituteId] = useState<string>('all');
  const [editCanteen, setEditCanteen] = useState<CanteenWithStats | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch institutes (super_admin only — for the filter dropdown)
  const { data: institutesData } = useQuery<{ data: Institute[] }>({
    queryKey: ['institutes'],
    queryFn: () => axios.get('/api/v1/admin/institutes').then((r) => r.data),
    enabled: isSuperAdmin,
  });
  const institutes = institutesData?.data ?? [];

  // Build query params
  const canteenParams = isSuperAdmin && selectedInstituteId !== 'all'
    ? `?institute_id=${selectedInstituteId}`
    : '';

  // Fetch canteens
  const { data: canteensData, isLoading } = useQuery<{ data: CanteenWithStats[] }>({
    queryKey: ['canteens-manage', selectedInstituteId],
    queryFn: () => axios.get(`/api/v1/admin/canteens${canteenParams}`).then((r) => r.data),
  });
  const canteens = canteensData?.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['canteens-manage'] });
    queryClient.invalidateQueries({ queryKey: ['canteens'] });
  };

  // Toggle is_open
  const toggleOpen = async (canteen: CanteenWithStats) => {
    try {
      await axios.put(`/api/v1/admin/canteens/${canteen.id}`, {
        is_open: !canteen.is_open,
      });
      invalidate();
    } catch {
      alert('Failed to update canteen status.');
    }
  };

  // Toggle cash_payments_enabled (defaults to true when the column is absent/null)
  const toggleCash = async (canteen: CanteenWithStats) => {
    try {
      await axios.put(`/api/v1/admin/canteens/${canteen.id}`, {
        cash_payments_enabled: canteen.cash_payments_enabled === false,
      });
      invalidate();
    } catch {
      alert('Failed to update cash payments setting.');
    }
  };

  // Toggle is_active
  const toggleActive = async (canteen: CanteenWithStats) => {
    const action = canteen.is_active ? 'deactivate' : 'activate';
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} "${canteen.name}"?`)) return;
    try {
      await axios.put(`/api/v1/admin/canteens/${canteen.id}`, {
        is_active: !canteen.is_active,
      });
      invalidate();
    } catch {
      alert('Failed to update canteen.');
    }
  };

  // Complete an interrupted add-on payment. The server recomputes a fresh
  // prorated quote and returns a new order; verify then activates the canteen.
  const handleResume = async (canteen: CanteenWithStats) => {
    setResumingId(canteen.id);
    try {
      const { data: co } = await axios.post(`/api/v1/admin/canteens/${canteen.id}/resume-payment`);
      const order = co.data;
      if (order.free) { invalidate(); return; } // ₹0 prorate → already active
      await payAndVerify(order, `Add canteen: ${canteen.name}`);
      invalidate();
    } catch (e) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.error?.message ?? 'Payment failed' : (e as Error).message;
      if (msg !== 'Payment cancelled') alert(msg);
    } finally {
      setResumingId(null);
    }
  };

  // Discard an unpaid pending canteen (hard-delete on the server).
  const handleDiscard = async (canteen: CanteenWithStats) => {
    if (!confirm(`Discard "${canteen.name}"? This removes the unpaid canteen — you can add it again later.`)) return;
    try {
      await axios.delete(`/api/v1/admin/canteens/${canteen.id}`);
      invalidate();
    } catch {
      alert('Failed to discard canteen.');
    }
  };

  // Only one pending canteen at a time — block adding another while one exists.
  const hasPending = canteens.some((c) => c.billing_state === 'pending_payment');

  return (
    <div className="space-y-5">
      {/* Header row: filters (super admin) + Add (canteen admin) */}
      <div className="flex flex-wrap items-center gap-3">
        {isSuperAdmin && (
          <>
            <div className="relative">
              <select
                value={selectedInstituteId}
                onChange={(e) => setSelectedInstituteId(e.target.value)}
                aria-label="Filter by institute"
                className="h-9 pl-3 pr-8 rounded-lg border border-border-2 bg-surface text-sm text-text hover:border-text-3 focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand appearance-none transition-all"
              >
                <option value="all">All Institutes</option>
                {institutes.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3 pointer-events-none" />
            </div>
            <p className="font-display text-sm font-semibold tracking-tight text-text-2">
              <span className="tabular-nums">{canteens.length}</span> canteen{canteens.length !== 1 ? 's' : ''}
            </p>
          </>
        )}
        {!isSuperAdmin && (
          <div className="ml-auto flex items-center gap-2">
            {hasPending && (
              <span className="text-xs text-amber-dark hidden sm:inline">Finish or discard your pending canteen first.</span>
            )}
            <Button
              size="sm"
              onClick={() => setShowAdd(true)}
              disabled={hasPending}
              title={hasPending ? 'Finish or discard your pending canteen first' : undefined}
            >
              <Plus className="w-4 h-4" /> Add Canteen
            </Button>
          </div>
        )}
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-surface rounded-2xl border border-border p-4 space-y-3 animate-pulse">
              <div className="h-32 bg-bg-2 rounded-xl" />
              <div className="h-4 bg-bg-2 rounded w-3/4" />
              <div className="h-3 bg-bg-2 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : canteens.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-16 h-16 rounded-full bg-amber-pale flex items-center justify-center">
            <Store className="w-7 h-7 text-amber-dark" />
          </div>
          <p className="font-display text-xl font-semibold tracking-tight text-text">No canteens found</p>
          <p className="text-sm text-text-3">
            {isSuperAdmin
              ? 'Add a canteen from the Institutes page.'
              : 'No canteens yet. Use “Add Canteen” above to add your first one.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {canteens.map((canteen) => (
            <CanteenCard
              key={canteen.id}
              canteen={canteen}
              isSuperAdmin={isSuperAdmin}
              resuming={resumingId === canteen.id}
              onEdit={() => setEditCanteen(canteen)}
              onToggleOpen={() => toggleOpen(canteen)}
              onToggleCash={() => toggleCash(canteen)}
              onToggleActive={() => toggleActive(canteen)}
              onResume={() => handleResume(canteen)}
              onDiscard={() => handleDiscard(canteen)}
            />
          ))}
        </div>
      )}

      {/* Edit dialog */}
      {editCanteen && (
        <EditCanteenDialog
          canteen={editCanteen}
          isSuperAdmin={isSuperAdmin}
          onClose={() => setEditCanteen(null)}
          onSuccess={() => {
            setEditCanteen(null);
            invalidate();
          }}
        />
      )}

      {/* Add dialog (canteen admin self-serve) */}
      {showAdd && (
        <AddCanteenDialog
          onClose={() => setShowAdd(false)}
          onSuccess={() => {
            setShowAdd(false);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

// ─── Canteen card ─────────────────────────────────────────────────────────────

function CanteenCard({
  canteen,
  isSuperAdmin,
  resuming,
  onEdit,
  onToggleOpen,
  onToggleCash,
  onToggleActive,
  onResume,
  onDiscard,
}: {
  canteen: CanteenWithStats;
  isSuperAdmin: boolean;
  resuming: boolean;
  onEdit: () => void;
  onToggleOpen: () => void;
  onToggleCash: () => void;
  onToggleActive: () => void;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const formatCurrency = (paise: number) =>
    '₹' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 });

  // Pending-payment canteen: an add-on whose payment was left unfinished. It is
  // not live (hidden from students); the admin resumes payment or discards it.
  if (canteen.billing_state === 'pending_payment') {
    return (
      <div className="bg-surface rounded-2xl border border-amber/40 overflow-hidden">
        <div className="relative h-36 bg-amber-pale overflow-hidden flex items-center justify-center">
          <Store className="w-10 h-10 text-amber-dark opacity-40" />
          <div className="absolute top-2 left-2">
            <Badge variant="warning" className="gap-1.5 shadow-sm">
              <AlertTriangle className="w-3 h-3" /> Payment pending
            </Badge>
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <h3 className="font-display font-semibold tracking-tight text-text text-base">{canteen.name}</h3>
            {canteen.description && <p className="text-xs text-text-3 mt-0.5 line-clamp-2">{canteen.description}</p>}
          </div>
          <div className="space-y-1.5">
            {canteen.location && (
              <div className="flex items-center gap-1.5 text-xs text-text-2">
                <MapPin className="w-3.5 h-3.5 text-text-3 shrink-0" />
                <span className="truncate">{canteen.location}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-text-2">
              <Clock className="w-3.5 h-3.5 text-text-3 shrink-0" />
              <span>{canteen.opens_at} – {canteen.closes_at}</span>
            </div>
          </div>
          <p className="text-xs text-text-3">
            {isSuperAdmin
              ? 'Not live yet — yet to be paid by the institute.'
              : 'Not live yet — complete the prorated payment to activate this canteen.'}
          </p>
          <div className="flex items-center gap-2 pt-1 border-t border-border">
            {isSuperAdmin ? (
              <div className="flex-1 flex items-center gap-1.5 text-xs font-medium text-amber-dark">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                Yet to be paid by the institute
              </div>
            ) : (
              <Button onClick={onResume} disabled={resuming} size="sm" className="flex-1">
                {resuming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                Complete Payment
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDiscard}
              disabled={resuming}
              title="Discard this pending canteen"
              className="text-red-400 hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-surface rounded-2xl border overflow-hidden transition-all ${
        canteen.is_active ? 'border-border' : 'border-border opacity-60'
      }`}
    >
      {/* Photo / placeholder */}
      <div className="relative h-36 bg-bg-2 overflow-hidden">
        {canteen.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={canteen.image_url}
            alt={canteen.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-brand-pale">
            <Store className="w-10 h-10 text-brand opacity-50" />
          </div>
        )}

        {/* Status badges */}
        <div className="absolute top-2 left-2 flex gap-1.5">
          <Badge variant={canteen.is_open ? 'success' : 'danger'} className="gap-1.5 shadow-sm">
            <span className={`w-1.5 h-1.5 rounded-full ${canteen.is_open ? 'bg-green' : 'bg-red-500'}`} />
            {canteen.is_open ? 'Open' : 'Closed'}
          </Badge>
          {!canteen.is_active && (
            <Badge variant="default" className="gap-1.5 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-text-3" />
              Inactive
            </Badge>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-display font-semibold tracking-tight text-text text-base">{canteen.name}</h3>
          {canteen.description && (
            <p className="text-xs text-text-3 mt-0.5 line-clamp-2">{canteen.description}</p>
          )}
        </div>

        {/* Meta */}
        <div className="space-y-1.5">
          {canteen.location && (
            <div className="flex items-center gap-1.5 text-xs text-text-2">
              <MapPin className="w-3.5 h-3.5 text-text-3 shrink-0" />
              <span className="truncate">{canteen.location}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-text-2">
            <Clock className="w-3.5 h-3.5 text-text-3 shrink-0" />
            <span>{canteen.opens_at} – {canteen.closes_at}</span>
          </div>
        </div>

        {/* Today's stats */}
        {(canteen.today_orders !== undefined || canteen.today_revenue_paise !== undefined) && (
          <div className="flex gap-4 pt-1 border-t border-border">
            <div>
              <p className="eyebrow">Orders today</p>
              <p className="font-display text-base font-semibold tracking-tight text-text tabular-nums">{canteen.today_orders ?? 0}</p>
            </div>
            <div>
              <p className="eyebrow">Revenue today</p>
              <p className="font-display text-base font-semibold tracking-tight text-text tabular-nums">
                {canteen.today_revenue_paise !== undefined
                  ? formatCurrency(canteen.today_revenue_paise)
                  : '—'}
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 border-t border-border">
          {/* Open/Closed toggle */}
          <button
            onClick={onToggleOpen}
            title={canteen.is_open ? 'Mark as Closed' : 'Mark as Open'}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors flex-1 justify-center ${
              canteen.is_open
                ? 'bg-green-light text-green-dark border-green/20 hover:bg-green-light/70'
                : 'bg-bg-2 text-text-2 border-border hover:bg-bg'
            }`}
          >
            {canteen.is_open ? (
              <><ToggleRight className="w-3.5 h-3.5" /> Open</>
            ) : (
              <><ToggleLeft className="w-3.5 h-3.5" /> Closed</>
            )}
          </button>

          {/* Edit */}
          <Button variant="ghost" size="icon-sm" onClick={onEdit} title="Edit canteen">
            <Pencil className="w-3.5 h-3.5" />
          </Button>

          {/* Activate / Deactivate */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onToggleActive}
            title={canteen.is_active ? 'Deactivate' : 'Activate'}
            className={
              canteen.is_active
                ? 'text-red-400 hover:text-red-600 hover:bg-red-50'
                : 'text-green hover:text-green-dark hover:bg-green-light'
            }
          >
            {canteen.is_active ? (
              <PowerOff className="w-3.5 h-3.5" />
            ) : (
              <Power className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>

        {/* Pay-by-cash toggle — cash is enabled unless explicitly turned off */}
        <button
          onClick={onToggleCash}
          title={canteen.cash_payments_enabled === false ? 'Enable cash payments for this canteen' : 'Disable cash payments for this canteen'}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors w-full justify-center ${
            canteen.cash_payments_enabled === false
              ? 'bg-bg-2 text-text-2 border-border hover:bg-bg'
              : 'bg-green-light text-green-dark border-green/20 hover:bg-green-light/70'
          }`}
        >
          <Banknote className="w-3.5 h-3.5" />
          {canteen.cash_payments_enabled === false ? 'Cash payments off' : 'Cash payments on'}
        </button>

        {/* GST status — read-only here; super_admin edits it in the Edit dialog */}
        <div
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border w-full justify-center ${
            canteen.gst_enabled === false
              ? 'bg-bg-2 text-text-2 border-border'
              : 'bg-green-light text-green-dark border-green/20'
          }`}
        >
          <Percent className="w-3.5 h-3.5" />
          {canteen.gst_enabled === false
            ? 'GST off'
            : `GST ${Number(canteen.tax_percentage ?? 5)}%`}
        </div>
      </div>
    </div>
  );
}

// ─── Edit Canteen Dialog ──────────────────────────────────────────────────────

function EditCanteenDialog({
  canteen,
  isSuperAdmin,
  onClose,
  onSuccess,
}: {
  canteen: CanteenWithStats;
  isSuperAdmin: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [imageUrl, setImageUrl] = useState(canteen.image_url ?? '');
  const [imageUploading, setImageUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [serverError, setServerError] = useState('');
  const [gstEnabled, setGstEnabled] = useState(canteen.gst_enabled !== false);
  const [taxPercentage, setTaxPercentage] = useState(String(canteen.tax_percentage ?? 5));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: canteen.name,
      location: canteen.location ?? '',
      opening_time: canteen.opens_at,
      closing_time: canteen.closes_at,
      description: canteen.description ?? '',
    },
  });

  const handleImageUpload = async (file: File) => {
    setImageUploading(true);
    setUploadError('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/v1/admin/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (json.url) {
        setImageUrl(json.url);
      } else {
        setUploadError(json.error?.message ?? 'Upload failed');
      }
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setImageUploading(false);
    }
  };

  const onSubmit = async (values: EditForm) => {
    setServerError('');
    try {
      await axios.put(`/api/v1/admin/canteens/${canteen.id}`, {
        name: values.name,
        location: values.location,
        description: values.description || null,
        opening_time: values.opening_time,
        closing_time: values.closing_time,
        image_url: imageUrl || null,
        ...(isSuperAdmin
          ? { gst_enabled: gstEnabled, tax_percentage: Number(taxPercentage) }
          : {}),
      });
      onSuccess();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error?.message ?? 'Request failed'
        : 'Unknown error';
      setServerError(msg);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-surface rounded-2xl border border-border shadow-lg w-full max-w-lg my-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-start justify-between">
          <div>
            <p className="eyebrow">Canteen</p>
            <h2 className="font-display text-lg font-semibold tracking-tight text-text">Edit Canteen</h2>
            <p className="text-xs text-text-3 mt-0.5">{canteen.name}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-text-3 hover:text-text transition rounded-lg p-1 hover:bg-bg-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          {serverError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {serverError}
            </p>
          )}

          {/* Photo */}
          <div className="border border-border rounded-xl overflow-hidden">
            {/* Preview */}
            <div className="h-36 bg-bg-2 relative overflow-hidden">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-brand-pale">
                  <ImageIcon className="w-8 h-8 text-brand opacity-50" />
                </div>
              )}
            </div>
            <div className="px-4 py-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={imageUploading}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-bg-2 transition disabled:opacity-60"
              >
                {imageUploading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
                ) : (
                  <><Upload className="w-3.5 h-3.5" /> {imageUrl ? 'Change Photo' : 'Upload Photo'}</>
                )}
              </button>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Remove
                </button>
              )}
              <span className="text-xs text-text-3 ml-auto">Max 5 MB</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(file);
                e.target.value = '';
              }}
            />
            {uploadError && (
              <p className="px-4 pb-3 text-xs text-red-500">{uploadError}</p>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">
              Canteen Name <span className="text-red-500">*</span>
            </label>
            <Input {...register('name')} placeholder="e.g. Main Canteen" error={!!errors.name} />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">
              Location / Building <span className="text-red-500">*</span>
            </label>
            <Input {...register('location')} placeholder="e.g. Block A, Ground Floor" error={!!errors.location} />
            {errors.location && <p className="text-xs text-red-500 mt-1">{errors.location.message}</p>}
          </div>

          {/* Hours */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">
                Opening Time <span className="text-red-500">*</span>
              </label>
              <Input {...register('opening_time')} type="time" error={!!errors.opening_time} />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">
                Closing Time <span className="text-red-500">*</span>
              </label>
              <Input {...register('closing_time')} type="time" error={!!errors.closing_time} />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Description</label>
            <textarea
              {...register('description')}
              rows={2}
              placeholder="Short description of the canteen…"
              className="w-full px-3 py-2 rounded-lg border border-border-2 bg-surface text-sm text-text placeholder:text-text-3 hover:border-text-3 focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand resize-none transition-all"
            />
          </div>

          {/* GST billing — super_admin only */}
          {isSuperAdmin && (
            <div className="border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-text">GST billing</p>
                  <p className="text-xs text-text-3 mt-0.5">
                    When off, students are charged no GST at this canteen.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setGstEnabled((v) => !v)}
                  aria-pressed={gstEnabled}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                    gstEnabled
                      ? 'bg-green-light text-green-dark border-green/20 hover:bg-green-light/70'
                      : 'bg-bg-2 text-text-2 border-border hover:bg-bg'
                  }`}
                >
                  {gstEnabled ? (
                    <><ToggleRight className="w-3.5 h-3.5" /> On</>
                  ) : (
                    <><ToggleLeft className="w-3.5 h-3.5" /> Off</>
                  )}
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">GST percentage</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={taxPercentage}
                  onChange={(e) => setTaxPercentage(e.target.value)}
                  disabled={!gstEnabled}
                  placeholder="5"
                />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting || imageUploading}>
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
