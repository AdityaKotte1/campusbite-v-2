'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  User,
  Mail,
  Phone,
  Bell,
  LogOut,
  ChevronRight,
  Trash2,
  Shield,
  Edit3,
  Loader2,
  Building2,
  Search,
  Check,
  X,
  LifeBuoy,
  FileText,
  Camera,
  KeyRound,
  Eye,
  EyeOff,
  Receipt,
  Tag,
  Volume2,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useUIStore } from '@/store/ui-store';
import { useAuthStore } from '@/store/auth-store';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Institute } from '@/types';

// ─── Institute picker bottom-sheet ───────────────────────────────────────────

function InstitutePickerSheet({
  currentInstituteId,
  onClose,
}: {
  currentInstituteId: string | null;
  onClose: () => void;
}) {
  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(currentInstituteId);

  const showToast = useUIStore((s) => s.showToast);
  const setUser = useAuthStore((s) => s.setUser);
  const currentUser = useAuthStore((s) => s.user);

  useEffect(() => {
    fetch('/api/v1/institutes')
      .then((r) => r.json())
      .then((json) => setInstitutes(json.data ?? []))
      .catch(() => showToast('Could not load institutes', 'error'))
      .finally(() => setLoading(false));
  }, [showToast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return institutes;
    return institutes.filter(
      (inst) =>
        inst.name.toLowerCase().includes(q) ||
        inst.city?.toLowerCase().includes(q) ||
        inst.state?.toLowerCase().includes(q)
    );
  }, [institutes, search]);

  const handleConfirm = async () => {
    if (!selected || selected === currentInstituteId) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/v1/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institute_id: selected }),
      });
      const json = await res.json();

      if (!res.ok) {
        showToast(json.message ?? 'Failed to update institute', 'error');
        return;
      }

      // Update the auth store with the new institute
      const chosenInstitute = institutes.find((i) => i.id === selected) ?? null;
      if (currentUser) {
        setUser({ ...currentUser, institute_id: selected, institute: chosenInstitute ?? undefined });
      }

      showToast('Institute updated successfully', 'success');
      onClose();
    } catch {
      showToast('Something went wrong. Try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const initials = (name: string) =>
    name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-text/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-surface rounded-t-2xl shadow-xl border-t border-border flex flex-col max-h-[85vh] animate-fade-up">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-border-2" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <div>
            <p className="eyebrow">Your campus</p>
            <h2 className="font-display text-lg font-semibold tracking-tight text-text mt-0.5">
              Change Institute
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-bg-2 text-text-3 hover:text-text transition-colors duration-150 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2 flex-shrink-0">
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by college name, city…"
            leftIcon={<Search className="w-4 h-4" />}
            aria-label="Search institutes"
            autoFocus
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
              <p className="text-sm text-text-3">Loading institutes…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-amber-pale flex items-center justify-center">
                <Building2 className="w-6 h-6 text-amber" />
              </div>
              <p className="text-sm text-text-3">No institutes match &quot;{search}&quot;</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map((inst) => {
                const isSelected = selected === inst.id;
                const isCurrent = currentInstituteId === inst.id;
                return (
                  <li key={inst.id}>
                    <button
                      onClick={() => setSelected(inst.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                        isSelected
                          ? 'border-brand bg-brand-pale'
                          : 'border-border bg-surface hover:bg-bg-2'
                      }`}
                    >
                      {/* Logo / initials */}
                      {inst.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={inst.logo_url}
                          alt=""
                          className="w-10 h-10 rounded-lg object-contain border border-border bg-surface flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-brand-pale text-brand flex items-center justify-center text-xs font-semibold flex-shrink-0">
                          {initials(inst.name)}
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text truncate">{inst.name}</p>
                        <p className="text-xs text-text-3 truncate">
                          {[inst.city, inst.state].filter(Boolean).join(', ')}
                        </p>
                        {isCurrent && (
                          <span className="text-xs text-brand font-medium">Current</span>
                        )}
                      </div>

                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center flex-shrink-0">
                          <Check className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Confirm button */}
        <div className="px-4 pb-6 pt-3 border-t border-border flex-shrink-0">
          <Button
            onClick={handleConfirm}
            disabled={saving || !selected}
            loading={saving}
            size="lg"
            className="w-full"
          >
            {saving ? 'Saving…' : selected === currentInstituteId ? 'Close' : 'Confirm Change'}
          </Button>
        </div>
      </div>
    </>
  );
}

// ─── Reusable bottom-sheet shell ─────────────────────────────────────────────

function SheetShell({
  eyebrow,
  title,
  onClose,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-text/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-50 bg-surface rounded-t-2xl shadow-xl border-t border-border flex flex-col max-h-[85vh] animate-fade-up">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-border-2" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 className="font-display text-lg font-semibold tracking-tight text-text mt-0.5">
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-bg-2 text-text-3 hover:text-text transition-colors duration-150 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <div className="px-4 pb-6 pt-3 border-t border-border flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        'relative h-6 w-11 rounded-full transition-colors duration-200 cursor-pointer flex-shrink-0',
        checked ? 'bg-brand' : 'bg-border-2'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-surface shadow-sm transition-transform duration-200',
          checked && 'translate-x-5'
        )}
      />
    </button>
  );
}

// ─── Edit profile (name · phone · avatar) ────────────────────────────────────

function EditProfileSheet({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const showToast = useUIStore((s) => s.showToast);

  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const name = fullName.trim();
    if (!name) {
      showToast('Name cannot be empty', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/v1/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: name,
          phone: phone.trim() === '' ? null : phone.trim(),
          avatar_url: avatarUrl.trim() === '' ? null : avatarUrl.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.message ?? 'Failed to update profile', 'error');
        return;
      }
      if (user) setUser({ ...user, ...json.data });
      showToast('Profile updated', 'success');
      onClose();
    } catch {
      showToast('Something went wrong. Try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const initials = fullName
    ? fullName
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'MA';

  return (
    <SheetShell
      eyebrow="Your details"
      title="Edit Profile"
      onClose={onClose}
      footer={
        <Button
          onClick={handleSave}
          disabled={saving}
          loading={saving}
          size="lg"
          className="w-full"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Avatar preview */}
        <div className="flex justify-center">
          <div className="relative">
            {avatarUrl.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="w-20 h-20 rounded-full object-cover ring-1 ring-border"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-brand-pale flex items-center justify-center ring-1 ring-brand/15">
                <span className="font-display text-2xl font-semibold text-brand">
                  {initials}
                </span>
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-brand text-white flex items-center justify-center shadow-warm">
              <Camera className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        <Input
          label="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Your name"
          maxLength={100}
        />
        <Input
          label="Phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="e.g. +91 98765 43210"
          maxLength={20}
          leftIcon={<Phone className="w-4 h-4" />}
        />
        <Input
          label="Avatar image URL"
          type="url"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://…"
          helperText="Paste a link to a photo, or leave blank to use initials."
        />
      </div>
    </SheetShell>
  );
}

// ─── Notification preferences (persisted locally) ────────────────────────────

const NOTIF_KEY = 'cb_notif_prefs';
type NotifPrefs = { orderUpdates: boolean; promotions: boolean; sound: boolean };
const DEFAULT_NOTIF: NotifPrefs = { orderUpdates: true, promotions: true, sound: true };

function NotificationsSheet({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_NOTIF);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTIF_KEY);
      if (raw) setPrefs({ ...DEFAULT_NOTIF, ...JSON.parse(raw) });
    } catch {
      /* ignore malformed prefs */
    }
  }, []);

  const toggle = (key: keyof NotifPrefs) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(NOTIF_KEY, JSON.stringify(next));
      } catch {
        /* ignore storage errors */
      }
      return next;
    });
  };

  const rows: {
    key: keyof NotifPrefs;
    icon: React.ReactNode;
    title: string;
    desc: string;
    tint: string;
  }[] = [
    {
      key: 'orderUpdates',
      icon: <Receipt className="w-4 h-4 text-brand" />,
      title: 'Order updates',
      desc: 'Status changes, ready-to-collect & pickup reminders.',
      tint: 'bg-brand-pale',
    },
    {
      key: 'promotions',
      icon: <Tag className="w-4 h-4 text-amber" />,
      title: 'Offers & promotions',
      desc: 'Deals, new items and campus food news.',
      tint: 'bg-amber-pale',
    },
    {
      key: 'sound',
      icon: <Volume2 className="w-4 h-4 text-green" />,
      title: 'In-app sounds',
      desc: 'Play a chime when an order is ready.',
      tint: 'bg-green-light',
    },
  ];

  return (
    <SheetShell
      eyebrow="Stay in the loop"
      title="Notifications"
      onClose={onClose}
      footer={
        <Button onClick={onClose} size="lg" className="w-full">
          Done
        </Button>
      }
    >
      <div className="space-y-2.5">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface"
          >
            <div
              className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                row.tint
              )}
            >
              {row.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text">{row.title}</p>
              <p className="text-xs text-text-3 leading-relaxed">{row.desc}</p>
            </div>
            <Toggle
              checked={prefs[row.key]}
              onChange={() => toggle(row.key)}
              label={row.title}
            />
          </div>
        ))}
        <p className="text-xs text-text-3 px-1 pt-1 leading-relaxed">
          Preferences are saved on this device. Order updates always appear in the
          Orders tab regardless of this setting.
        </p>
      </div>
    </SheetShell>
  );
}

// ─── Privacy & security (change password) ────────────────────────────────────

function PrivacySheet({ onClose }: { onClose: () => void }) {
  const showToast = useUIStore((s) => s.showToast);
  const [provider, setProvider] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => setProvider(data.user?.app_metadata?.provider ?? 'email'))
      .catch(() => setProvider('email'))
      .finally(() => setChecking(false));
  }, []);

  const isPasswordAccount = provider === 'email';

  const handleChange = async () => {
    if (password.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }
    if (password !== confirm) {
      showToast('Passwords do not match', 'error');
      return;
    }
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        showToast(error.message, 'error');
        return;
      }
      showToast('Password updated', 'success');
      onClose();
    } catch {
      showToast('Something went wrong. Try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SheetShell
      eyebrow="Account safety"
      title="Privacy & Security"
      onClose={onClose}
      footer={
        isPasswordAccount && !checking ? (
          <Button
            onClick={handleChange}
            disabled={saving}
            loading={saving}
            size="lg"
            className="w-full"
          >
            {saving ? 'Updating…' : 'Update Password'}
          </Button>
        ) : undefined
      }
    >
      {checking ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-brand" />
          <p className="text-sm text-text-3">Loading…</p>
        </div>
      ) : isPasswordAccount ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-bg-2 border border-border">
            <div className="w-9 h-9 rounded-lg bg-brand-pale flex items-center justify-center flex-shrink-0">
              <KeyRound className="w-4 h-4 text-brand" />
            </div>
            <p className="text-xs text-text-2 leading-relaxed">
              Set a new password for your MunchAdda account. Use at least 8
              characters.
            </p>
          </div>

          <Input
            label="New password"
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            rightIcon={
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? 'Hide password' : 'Show password'}
                className="text-text-3 hover:text-text transition-colors cursor-pointer"
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            }
          />
          <Input
            label="Confirm new password"
            type={show ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
          <div className="w-14 h-14 rounded-full bg-amber-pale flex items-center justify-center">
            <Shield className="w-6 h-6 text-amber" />
          </div>
          <p className="text-sm font-semibold text-text">
            Signed in with{' '}
            <span className="capitalize">{provider ?? 'a social account'}</span>
          </p>
          <p className="text-sm text-text-3 max-w-xs leading-relaxed">
            Your password is managed by your {provider ?? 'social'} account. Manage
            sign-in and security there.
          </p>
        </div>
      )}
    </SheetShell>
  );
}

// ─── Profile page ─────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, signOut, loading } = useAuth();
  const showToast = useUIStore((s) => s.showToast);
  const [signingOut, setSigningOut] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showInstitutePicker, setShowInstitutePicker] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      const res = await fetch('/api/v1/users/me', { method: 'DELETE' });
      if (!res.ok) {
        showToast('Could not delete account. Try again.', 'error');
        setDeleting(false);
        return;
      }
      showToast('Your account has been deleted.', 'success');
      await signOut();
    } catch {
      showToast('Something went wrong.', 'error');
      setDeleting(false);
    }
  }

  const initials = user?.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'MA';

  return (
    <>
      <div className="max-w-lg mx-auto px-4 pt-6 pb-8 space-y-5 animate-fade-up">
        <header>
          <p className="eyebrow">Your account</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-text mt-1">
            Profile
          </h1>
          <div className="rule-amber mt-3" />
        </header>

        {/* Avatar + Info */}
        <div className="bg-surface rounded-2xl border border-border p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="relative">
              {user?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url}
                  alt={user.full_name}
                  className="w-16 h-16 rounded-full object-cover ring-1 ring-border"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-brand-pale flex items-center justify-center ring-1 ring-brand/15">
                  <span className="font-display text-xl font-semibold text-brand">{initials}</span>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="font-display text-xl font-semibold tracking-tight text-text truncate">
                {user?.full_name ?? 'Campus Student'}
              </h2>
              <p className="text-sm text-text-2 truncate">{user?.email}</p>
              {user?.institute?.name && (
                <p className="text-xs text-brand font-medium mt-0.5 truncate">{user.institute.name}</p>
              )}
            </div>

            <button
              onClick={() => setShowEditProfile(true)}
              aria-label="Edit profile"
              className="p-2 rounded-full hover:bg-bg-2 transition-colors duration-150 text-text-3 hover:text-text cursor-pointer"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Account Details */}
        <section className="bg-surface rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-border">
            <p className="eyebrow">Account</p>
          </div>
          <div className="divide-y divide-border">
            <div className="flex items-center gap-3 px-4 py-3.5 min-h-[56px]">
              <div className="w-9 h-9 bg-brand-pale rounded-lg flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-brand" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-3">Full Name</p>
                <p className="text-sm font-medium text-text">{user?.full_name ?? '—'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-3.5 min-h-[56px]">
              <div className="w-9 h-9 bg-bg-2 rounded-lg flex items-center justify-center flex-shrink-0">
                <Mail className="w-4 h-4 text-text-2" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-3">Email</p>
                <p className="text-sm font-medium text-text truncate">{user?.email ?? '—'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-3.5 min-h-[56px]">
              <div className="w-9 h-9 bg-green-light rounded-lg flex items-center justify-center flex-shrink-0">
                <Phone className="w-4 h-4 text-green" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-3">Phone</p>
                <p className="text-sm font-medium text-text">{user?.phone ?? 'Not set'}</p>
              </div>
              <button
                onClick={() => setShowEditProfile(true)}
                aria-label="Edit phone"
                className="text-text-3 hover:text-brand transition-colors duration-150 cursor-pointer p-1"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Institute row */}
            <button
              onClick={() => setShowInstitutePicker(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[56px] hover:bg-bg-2 transition-colors duration-150 cursor-pointer"
            >
              <div className="w-9 h-9 bg-amber-pale rounded-lg flex items-center justify-center flex-shrink-0">
                <Building2 className="w-4 h-4 text-amber" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs text-text-3">Institute</p>
                <p className="text-sm font-medium text-text truncate">
                  {user?.institute?.name ?? 'Not set'}
                </p>
              </div>
              <span className="text-xs text-brand font-medium mr-1">Change</span>
              <ChevronRight className="w-4 h-4 text-text-3 flex-shrink-0" />
            </button>
          </div>
        </section>

        {/* Settings */}
        <section className="bg-surface rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-border">
            <p className="eyebrow">Settings</p>
          </div>
          <div className="divide-y divide-border">
            <button
              onClick={() => setShowNotifications(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[56px] hover:bg-bg-2 transition-colors duration-150 cursor-pointer"
            >
              <div className="w-9 h-9 bg-amber-pale rounded-lg flex items-center justify-center flex-shrink-0">
                <Bell className="w-4 h-4 text-amber" />
              </div>
              <span className="flex-1 text-sm font-medium text-text text-left">Notifications</span>
              <ChevronRight className="w-4 h-4 text-text-3" />
            </button>

            <button
              onClick={() => setShowPrivacy(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[56px] hover:bg-bg-2 transition-colors duration-150 cursor-pointer"
            >
              <div className="w-9 h-9 bg-bg-2 rounded-lg flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4 text-text-2" />
              </div>
              <span className="flex-1 text-sm font-medium text-text text-left">Privacy &amp; Security</span>
              <ChevronRight className="w-4 h-4 text-text-3" />
            </button>
          </div>
        </section>

        {/* Billing */}
        <section className="bg-surface rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-border">
            <p className="eyebrow">Billing</p>
          </div>
          <div className="divide-y divide-border">
            <Link href="/invoices" className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[56px] hover:bg-bg-2 transition-colors duration-150 cursor-pointer">
              <div className="w-9 h-9 bg-green-light rounded-lg flex items-center justify-center flex-shrink-0">
                <Receipt className="w-4 h-4 text-green" />
              </div>
              <span className="flex-1 text-sm font-medium text-text text-left">Invoices</span>
              <ChevronRight className="w-4 h-4 text-text-3" />
            </Link>
          </div>
        </section>

        {/* Support & Legal */}
        <section className="bg-surface rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-border">
            <p className="eyebrow">Support &amp; Legal</p>
          </div>
          <div className="divide-y divide-border">
            <Link href="/support" className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[56px] hover:bg-bg-2 transition-colors duration-150 cursor-pointer">
              <div className="w-9 h-9 bg-brand-pale rounded-lg flex items-center justify-center flex-shrink-0">
                <LifeBuoy className="w-4 h-4 text-brand" />
              </div>
              <span className="flex-1 text-sm font-medium text-text text-left">Help &amp; Support</span>
              <ChevronRight className="w-4 h-4 text-text-3" />
            </Link>
            <Link href="/legal" className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[56px] hover:bg-bg-2 transition-colors duration-150 cursor-pointer">
              <div className="w-9 h-9 bg-bg-2 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileText className="w-4 h-4 text-text-2" />
              </div>
              <span className="flex-1 text-sm font-medium text-text text-left">Legal &amp; Policies</span>
              <ChevronRight className="w-4 h-4 text-text-3" />
            </Link>
          </div>
        </section>

        {/* Sign Out */}
        <Button
          onClick={handleSignOut}
          disabled={signingOut || loading}
          loading={signingOut}
          variant="secondary"
          size="lg"
          className="w-full"
        >
          {!signingOut && <LogOut className="w-4 h-4" />}
          Sign Out
        </Button>

        {/* Danger Zone */}
        <section className="bg-surface rounded-2xl border border-red-200 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-red-100 bg-red-50">
            <p className="text-[11px] font-semibold text-red-600 uppercase tracking-[0.14em]">Danger Zone</p>
          </div>
          {showDeleteConfirm ? (
            <div className="p-4">
              <p className="text-sm text-text-2 mb-4 leading-relaxed">
                This will permanently delete your account and all data. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  loading={deleting}
                  variant="danger"
                  className="flex-1"
                >
                  Delete Account
                </Button>
                <Button
                  onClick={() => setShowDeleteConfirm(false)}
                  variant="secondary"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 min-h-[56px] hover:bg-red-50 transition-colors duration-150 cursor-pointer"
            >
              <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-4 h-4 text-red-500" />
              </div>
              <span className="flex-1 text-sm font-medium text-red-600 text-left">Delete Account</span>
              <ChevronRight className="w-4 h-4 text-red-400" />
            </button>
          )}
        </section>

        <p className="text-center text-xs text-text-3 tabular-nums">MunchAdda v0.1.0</p>
      </div>

      {/* Institute picker bottom sheet */}
      {showInstitutePicker && (
        <InstitutePickerSheet
          currentInstituteId={user?.institute_id ?? null}
          onClose={() => setShowInstitutePicker(false)}
        />
      )}

      {/* Edit profile bottom sheet */}
      {showEditProfile && (
        <EditProfileSheet onClose={() => setShowEditProfile(false)} />
      )}

      {/* Notification preferences bottom sheet */}
      {showNotifications && (
        <NotificationsSheet onClose={() => setShowNotifications(false)} />
      )}

      {/* Privacy & security bottom sheet */}
      {showPrivacy && <PrivacySheet onClose={() => setShowPrivacy(false)} />}
    </>
  );
}
