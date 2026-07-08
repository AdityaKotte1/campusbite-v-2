'use client';

import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  Plus, ChevronDown, ChevronRight, Pencil, Power, PowerOff, Store,
  UserCheck, UserMinus, Loader2, Building2, Upload, ImageIcon, X,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { initials } from '@/lib/formatting';
import type { Institute, Canteen } from '@/types';

// ─── Extended types ──────────────────────────────────────────────────────────

interface InstituteWithMeta extends Institute {
  canteen_count: number;
  admin: { full_name: string | null; email: string } | null;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const addInstituteSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  short_name: z.string().min(1, 'Code is required').max(10, 'Max 10 chars'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  pincode: z.string().optional(),
  address: z.string().optional(),
  logo_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

const addCanteenSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  location: z.string().min(1, 'Location is required'),
  opening_time: z.string().min(1, 'Opening time is required'),
  closing_time: z.string().min(1, 'Closing time is required'),
  description: z.string().optional(),
  image_url: z.string().optional(),
});

const assignAdminSchema = z.object({
  email: z.string().email('Valid email required'),
});

type AddInstituteForm = z.infer<typeof addInstituteSchema>;
type AddCanteenForm = z.infer<typeof addCanteenSchema>;
type AssignAdminForm = z.infer<typeof assignAdminSchema>;

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InstitutesPage() {
  const queryClient = useQueryClient();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showAddInstitute, setShowAddInstitute] = useState(false);
  const [addCanteenFor, setAddCanteenFor] = useState<string | null>(null);
  const [assignAdminFor, setAssignAdminFor] = useState<string | null>(null);
  const [unassignAdminFor, setUnassignAdminFor] = useState<InstituteWithMeta | null>(null);
  const [editInstitute, setEditInstitute] = useState<InstituteWithMeta | null>(null);

  const { data, isLoading } = useQuery<{ success: boolean; data: InstituteWithMeta[] }>({
    queryKey: ['institutes'],
    queryFn: () => axios.get('/api/v1/admin/institutes').then((r) => r.data),
  });

  const institutes = data?.data ?? [];

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Deactivate this institute? All canteens will be affected.')) return;
    try {
      await axios.delete(`/api/v1/admin/institutes/${id}`);
      queryClient.invalidateQueries({ queryKey: ['institutes'] });
    } catch {
      alert('Failed to deactivate institute.');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await axios.put(`/api/v1/admin/institutes/${id}`, { is_active: true });
      queryClient.invalidateQueries({ queryKey: ['institutes'] });
    } catch {
      alert('Failed to activate institute.');
    }
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['institutes'] });
    queryClient.invalidateQueries({ queryKey: ['canteens'] });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Network</p>
          <p className="font-display text-sm font-semibold tracking-tight text-text-2">
            <span className="tabular-nums">{institutes.length}</span> institute{institutes.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Button onClick={() => setShowAddInstitute(true)}>
          <Plus className="w-4 h-4" /> Add Institute
        </Button>
      </div>

      {/* Table card */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr>
              {['', 'Institute', 'Code', 'Location', 'Canteens', 'Admin', 'Status', 'Actions'].map((h) => (
                <th
                  key={h}
                  className="h-10 px-4 text-left text-xs font-semibold text-text-3 uppercase tracking-wide bg-bg-2 border-b border-border"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array(8).fill(0).map((_, j) => (
                      <td key={j} className="px-4 py-3 border-b border-border">
                        <div className="h-4 bg-bg-2 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              : institutes.length === 0
              ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-amber-pale flex items-center justify-center">
                        <Building2 className="w-6 h-6 text-amber-dark" />
                      </div>
                      <p className="font-display text-lg font-semibold tracking-tight text-text">No institutes yet</p>
                      <p className="text-sm text-text-3">Add one to get started.</p>
                    </div>
                  </td>
                </tr>
              )
              : institutes.map((inst) => (
                  <InstituteRows
                    key={inst.id}
                    institute={inst}
                    expanded={expandedIds.has(inst.id)}
                    onToggle={() => toggleExpand(inst.id)}
                    onAddCanteen={() => setAddCanteenFor(inst.id)}
                    onAssignAdmin={() => setAssignAdminFor(inst.id)}
                    onUnassignAdmin={() => setUnassignAdminFor(inst)}
                    onEdit={() => setEditInstitute(inst)}
                    onDeactivate={() => handleDeactivate(inst.id)}
                    onActivate={() => handleActivate(inst.id)}
                  />
                ))}
          </tbody>
        </table>
        </div>
      </div>

      {/* Dialogs */}
      {showAddInstitute && (
        <AddInstituteDialog
          onClose={() => setShowAddInstitute(false)}
          onSuccess={() => { setShowAddInstitute(false); invalidate(); }}
        />
      )}
      {editInstitute && (
        <AddInstituteDialog
          institute={editInstitute}
          onClose={() => setEditInstitute(null)}
          onSuccess={() => { setEditInstitute(null); invalidate(); }}
        />
      )}
      {addCanteenFor && (
        <AddCanteenDialog
          instituteId={addCanteenFor}
          onClose={() => setAddCanteenFor(null)}
          onSuccess={() => { setAddCanteenFor(null); invalidate(); }}
        />
      )}
      {assignAdminFor && (
        <AssignAdminDialog
          instituteId={assignAdminFor}
          onClose={() => setAssignAdminFor(null)}
          onSuccess={() => { setAssignAdminFor(null); invalidate(); }}
        />
      )}
      {unassignAdminFor && (
        <UnassignAdminDialog
          institute={unassignAdminFor}
          onClose={() => setUnassignAdminFor(null)}
          onSuccess={() => { setUnassignAdminFor(null); invalidate(); }}
        />
      )}
    </div>
  );
}

// ─── InstituteRows ────────────────────────────────────────────────────────────

function InstituteRows({
  institute,
  expanded,
  onToggle,
  onAddCanteen,
  onAssignAdmin,
  onUnassignAdmin,
  onEdit,
  onDeactivate,
  onActivate,
}: {
  institute: InstituteWithMeta;
  expanded: boolean;
  onToggle: () => void;
  onAddCanteen: () => void;
  onAssignAdmin: () => void;
  onUnassignAdmin: () => void;
  onEdit: () => void;
  onDeactivate: () => void;
  onActivate: () => void;
}) {
  const { data: canteensData, isLoading: canteensLoading } = useQuery<{ success: boolean; data: Canteen[] }>({
    queryKey: ['canteens', institute.id],
    queryFn: () => axios.get(`/api/v1/admin/canteens?institute_id=${institute.id}`).then((r) => r.data),
    enabled: expanded,
  });

  const canteens = canteensData?.data ?? [];

  return (
    <>
      <tr className="border-b border-border hover:bg-bg-2 transition-colors">
        {/* Expand toggle */}
        <td className="px-4 py-3 w-8">
          <button
            onClick={onToggle}
            className="p-0.5 rounded text-text-3 hover:text-text transition"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>

        {/* Name + logo */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            {institute.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={institute.logo_url} alt="" className="w-8 h-8 rounded-lg object-contain border border-border" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-brand-pale text-brand flex items-center justify-center font-display text-xs font-semibold shrink-0">
                {initials(institute.name)}
              </div>
            )}
            <span className="font-medium text-text">{institute.name}</span>
          </div>
        </td>

        <td className="px-4 py-3 text-text-3 font-mono text-xs">{institute.code}</td>

        <td className="px-4 py-3 text-text-2">
          {[institute.city, institute.state].filter(Boolean).join(', ') || '—'}
        </td>

        <td className="px-4 py-3">
          <span className="inline-flex items-center gap-1 text-text-2">
            <Store className="w-3.5 h-3.5 text-text-3" />
            <span className="tabular-nums">{institute.canteen_count}</span>
          </span>
        </td>

        <td className="px-4 py-3">
          {institute.admin ? (
            <div>
              <p className="text-xs font-medium text-text">{institute.admin.full_name ?? '—'}</p>
              <p className="text-xs text-text-3">{institute.admin.email}</p>
            </div>
          ) : (
            <span className="text-xs text-text-3 italic">Unassigned</span>
          )}
        </td>

        <td className="px-4 py-3">
          <Badge variant={institute.is_active ? 'success' : 'danger'} className="gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${institute.is_active ? 'bg-green' : 'bg-text-3'}`} />
            {institute.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </td>

        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" title="Add canteen" onClick={onAddCanteen}>
              <Store className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" title="Assign admin" onClick={onAssignAdmin}>
              <UserCheck className="w-3.5 h-3.5" />
            </Button>
            {institute.admin && (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Remove admin (demote to student)"
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                onClick={onUnassignAdmin}
              >
                <UserMinus className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" title="Edit" onClick={onEdit}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            {institute.is_active ? (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Deactivate"
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                onClick={onDeactivate}
              >
                <PowerOff className="w-3.5 h-3.5" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-sm"
                title="Activate"
                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                onClick={onActivate}
              >
                <Power className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded canteens sub-rows */}
      {expanded && (
        <tr>
          <td colSpan={8} className="px-0 py-0 bg-bg-2 border-b border-border">
            <div className="pl-12 pr-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="eyebrow">
                  Canteens under {institute.name}
                </p>
                <Button size="sm" variant="outline" onClick={onAddCanteen}>
                  <Plus className="w-3.5 h-3.5" /> Add Canteen
                </Button>
              </div>

              {canteensLoading ? (
                <div className="flex items-center gap-2 text-xs text-text-3 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading canteens...
                </div>
              ) : canteens.length === 0 ? (
                <p className="text-xs text-text-3 italic py-2">No canteens yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {canteens.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 bg-surface rounded-lg border border-border px-3 py-2"
                    >
                      <div className="w-8 h-8 rounded-lg bg-brand-pale text-brand flex items-center justify-center font-display text-xs font-semibold shrink-0">
                        {initials(c.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-text truncate">{c.name}</p>
                        <p className="text-xs text-text-3 truncate">{c.location ?? c.building ?? '—'}</p>
                      </div>
                      <Badge variant={c.is_active ? 'success' : 'danger'} className="shrink-0 gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${c.is_active ? 'bg-green' : 'bg-text-3'}`} />
                        {c.is_active ? 'On' : 'Off'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Dialog: Add / Edit Institute ────────────────────────────────────────────

function AddInstituteDialog({
  institute,
  onClose,
  onSuccess,
}: {
  institute?: InstituteWithMeta;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!institute;
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AddInstituteForm>({
    resolver: zodResolver(addInstituteSchema),
    defaultValues: institute
      ? {
          name: institute.name,
          short_name: institute.code,
          city: institute.city ?? '',
          state: institute.state ?? '',
          pincode: institute.pincode ?? '',
          address: institute.address ?? '',
          logo_url: institute.logo_url ?? '',
        }
      : {},
  });

  const onSubmit = async (values: AddInstituteForm) => {
    setServerError('');
    try {
      if (isEdit) {
        await axios.put(`/api/v1/admin/institutes/${institute!.id}`, values);
      } else {
        await axios.post('/api/v1/admin/institutes', values);
      }
      onSuccess();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error?.message ?? 'Request failed'
        : 'Unknown error';
      setServerError(msg);
    }
  };

  return (
    <DialogShell title={isEdit ? 'Edit Institute' : 'Add Institute'} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
        {serverError && <ErrorBanner message={serverError} />}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <FieldLabel required>Institute Name</FieldLabel>
            <Input {...register('name')} placeholder="e.g. IIT Bombay" error={!!errors.name} />
            <FieldError msg={errors.name?.message} />
          </div>
          <div>
            <FieldLabel required>Short Code</FieldLabel>
            <Input {...register('short_name')} placeholder="IITB" error={!!errors.short_name} />
            <FieldError msg={errors.short_name?.message} />
          </div>
          <div>
            <FieldLabel>Pincode</FieldLabel>
            <Input {...register('pincode')} placeholder="400076" />
          </div>
          <div>
            <FieldLabel required>City</FieldLabel>
            <Input {...register('city')} placeholder="Mumbai" error={!!errors.city} />
            <FieldError msg={errors.city?.message} />
          </div>
          <div>
            <FieldLabel required>State</FieldLabel>
            <Input {...register('state')} placeholder="Maharashtra" error={!!errors.state} />
            <FieldError msg={errors.state?.message} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>Address</FieldLabel>
            <Input {...register('address')} placeholder="Powai, Mumbai" />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel>Logo URL</FieldLabel>
            <Input {...register('logo_url')} placeholder="https://..." error={!!errors.logo_url} />
            <FieldError msg={errors.logo_url?.message} />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Institute'}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}

// ─── Dialog: Add Canteen ─────────────────────────────────────────────────────

function AddCanteenDialog({
  instituteId,
  onClose,
  onSuccess,
}: {
  instituteId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AddCanteenForm>({ resolver: zodResolver(addCanteenSchema) });

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

  const onSubmit = async (values: AddCanteenForm) => {
    setServerError('');
    try {
      await axios.post('/api/v1/admin/canteens', {
        institute_id: instituteId,
        name: values.name,
        location: values.location,
        description: values.description,
        opening_time: values.opening_time,
        closing_time: values.closing_time,
        image_url: imageUrl || null,
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
    <DialogShell title="Add Canteen" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
        {serverError && <ErrorBanner message={serverError} />}

        <div>
          <FieldLabel required>Canteen Name</FieldLabel>
          <Input {...register('name')} placeholder="e.g. Main Canteen" error={!!errors.name} />
          <FieldError msg={errors.name?.message} />
        </div>
        <div>
          <FieldLabel required>Location / Building</FieldLabel>
          <Input {...register('location')} placeholder="e.g. Block A, Ground Floor" error={!!errors.location} />
          <FieldError msg={errors.location?.message} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <FieldLabel required>Opening Time</FieldLabel>
            <Input {...register('opening_time')} type="time" error={!!errors.opening_time} />
            <FieldError msg={errors.opening_time?.message} />
          </div>
          <div>
            <FieldLabel required>Closing Time</FieldLabel>
            <Input {...register('closing_time')} type="time" error={!!errors.closing_time} />
            <FieldError msg={errors.closing_time?.message} />
          </div>
        </div>
        <div>
          <FieldLabel>Description</FieldLabel>
          <Input {...register('description')} placeholder="Optional description" />
        </div>

        {/* Canteen Photo */}
        <div className="border border-border rounded-xl p-4 space-y-3">
          <p className="eyebrow">Canteen Photo</p>

          {imageUrl && (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="Preview"
                className="w-16 h-16 rounded-lg object-cover border border-border"
              />
              <div className="flex-1">
                <p className="text-xs text-text-2">Photo uploaded</p>
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  className="text-xs text-red-400 hover:text-red-600 underline mt-0.5"
                >
                  Remove
                </button>
              </div>
            </div>
          )}

          {!imageUrl && (
            <div className="flex items-center gap-2 p-3 border border-dashed border-border rounded-lg">
              <ImageIcon className="w-8 h-8 text-text-3 shrink-0" />
              <span className="text-xs text-text-3">No photo yet</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={imageUploading}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-bg-2 transition disabled:opacity-60"
            >
              {imageUploading ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
              ) : (
                <><Upload className="w-3.5 h-3.5" /> Upload Photo</>
              )}
            </button>
            <span className="text-xs text-text-3">Max 5 MB. JPG, PNG or WebP.</span>
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
          {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Add Canteen
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}

// ─── Dialog: Assign Admin ────────────────────────────────────────────────────

function AssignAdminDialog({
  instituteId,
  onClose,
  onSuccess,
}: {
  instituteId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AssignAdminForm>({ resolver: zodResolver(assignAdminSchema) });

  const onSubmit = async (values: AssignAdminForm) => {
    setServerError('');
    try {
      await axios.post(`/api/v1/admin/institutes/${instituteId}/assign-admin`, { email: values.email });
      onSuccess();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error?.message ?? 'Request failed'
        : 'Unknown error';
      setServerError(msg);
    }
  };

  return (
    <DialogShell title="Assign Canteen Admin" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
        {serverError && <ErrorBanner message={serverError} />}

        <p className="text-sm text-text-2">
          Enter the email of an existing user to assign them as the Canteen Admin for this institute.
          Their role will be updated to <strong>canteen_admin</strong>.
        </p>

        <div>
          <FieldLabel required>User Email</FieldLabel>
          <Input
            {...register('email')}
            type="email"
            placeholder="admin@example.com"
            error={!!errors.email}
          />
          <FieldError msg={errors.email?.message} />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Assign Admin
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

// ─── Dialog: Unassign / Demote Admin ─────────────────────────────────────────

function UnassignAdminDialog({
  institute,
  onClose,
  onSuccess,
}: {
  institute: InstituteWithMeta;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const adminEmail = institute.admin?.email ?? '';
  const adminName = institute.admin?.full_name ?? adminEmail;

  const onConfirm = async () => {
    if (submitting) return;
    setServerError('');
    setSubmitting(true);
    try {
      await axios.post(`/api/v1/admin/institutes/${institute.id}/unassign-admin`, { email: adminEmail });
      onSuccess();
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error?.message ?? 'Request failed'
        : 'Unknown error';
      setServerError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogShell title="Remove Canteen Admin" onClose={onClose}>
      <div className="p-5 space-y-4">
        {serverError && <ErrorBanner message={serverError} />}

        <p className="text-sm text-text-2">
          Demote <strong>{adminName}</strong> to a student? They will lose canteen-admin
          access to <strong>{institute.name}</strong>. You can re-assign them anytime.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" className="flex-1" onClick={onConfirm} disabled={submitting}>
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Remove Admin
          </Button>
        </div>
      </div>
    </DialogShell>
  );
}

function DialogShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-surface rounded-2xl border border-border shadow-lg w-full max-w-lg my-4 max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between">
          <div>
            <p className="eyebrow">Network</p>
            <h2 className="font-display text-lg font-semibold tracking-tight text-text">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-text-3 hover:text-text transition rounded-lg p-1 hover:bg-bg-2"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-text mb-1.5">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-red-600">{msg}</p>;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      {message}
    </p>
  );
}
