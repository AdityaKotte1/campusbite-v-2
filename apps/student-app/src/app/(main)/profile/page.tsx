'use client';

import { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useUIStore } from '@/store/ui-store';
import { useAuthStore } from '@/store/auth-store';
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
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh]">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-text">Change Institute</h2>
            <p className="text-xs text-text-3 mt-0.5">Select your college or university</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-bg text-text-3 hover:text-text transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by college name, city…"
              className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-bg text-sm text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-brand"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-brand" />
              <p className="text-sm text-text-3">Loading institutes…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-text-3">
              <Building2 className="w-8 h-8 opacity-40" />
              <p className="text-sm">No institutes match &quot;{search}&quot;</p>
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
                      className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all text-left ${
                        isSelected
                          ? 'border-brand bg-brand-pale'
                          : 'border-border bg-white hover:bg-bg'
                      }`}
                    >
                      {/* Logo / initials */}
                      {inst.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={inst.logo_url}
                          alt=""
                          className="w-10 h-10 rounded-xl object-contain border border-border bg-white flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-brand-pale text-brand flex items-center justify-center text-xs font-bold flex-shrink-0">
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
          <button
            onClick={handleConfirm}
            disabled={saving || !selected}
            className="w-full h-12 bg-brand text-white rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60 active:scale-95 transition-transform"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            ) : selected === currentInstituteId ? (
              'Close'
            ) : (
              'Confirm Change'
            )}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Profile page ─────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, signOut, loading } = useAuth();
  const showToast = useUIStore((s) => s.showToast);
  const [signingOut, setSigningOut] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showInstitutePicker, setShowInstitutePicker] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
  }

  const initials = user?.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'CB';

  return (
    <>
      <div className="max-w-lg mx-auto px-4 pt-4 pb-6 space-y-4">
        <h1 className="text-xl font-bold text-text">Profile</h1>

        {/* Avatar + Info */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <div className="flex items-center gap-4">
            <div className="relative">
              {user?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url}
                  alt={user.full_name}
                  className="w-16 h-16 rounded-full object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-brand flex items-center justify-center">
                  <span className="text-white text-xl font-bold">{initials}</span>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-text truncate">
                {user?.full_name ?? 'Campus Student'}
              </h2>
              <p className="text-sm text-text-2 truncate">{user?.email}</p>
              {user?.institute?.name && (
                <p className="text-xs text-brand mt-0.5 truncate">{user.institute.name}</p>
              )}
            </div>

            <button
              onClick={() => showToast('Edit profile coming soon', 'info')}
              className="p-2 rounded-full hover:bg-bg transition-colors text-text-3 hover:text-text"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Account Details */}
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold text-text-3 uppercase tracking-wide">Account</p>
          </div>
          <div className="divide-y divide-border">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-8 h-8 bg-brand-pale rounded-lg flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-brand" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-3">Full Name</p>
                <p className="text-sm font-medium text-text">{user?.full_name ?? '—'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Mail className="w-4 h-4 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-3">Email</p>
                <p className="text-sm font-medium text-text truncate">{user?.email ?? '—'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="w-8 h-8 bg-green-light rounded-lg flex items-center justify-center flex-shrink-0">
                <Phone className="w-4 h-4 text-green" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-3">Phone</p>
                <p className="text-sm font-medium text-text">{user?.phone ?? 'Not set'}</p>
              </div>
              <button
                onClick={() => showToast('Phone editing coming soon', 'info')}
                className="text-text-3 hover:text-brand"
              >
                <Edit3 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Institute row */}
            <button
              onClick={() => setShowInstitutePicker(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-bg transition-colors"
            >
              <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Building2 className="w-4 h-4 text-orange-500" />
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
        </div>

        {/* Settings */}
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-semibold text-text-3 uppercase tracking-wide">Settings</p>
          </div>
          <div className="divide-y divide-border">
            <button
              onClick={() => showToast('Notifications settings coming soon', 'info')}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-bg transition-colors"
            >
              <div className="w-8 h-8 bg-yellow-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Bell className="w-4 h-4 text-yellow-500" />
              </div>
              <span className="flex-1 text-sm font-medium text-text text-left">Notifications</span>
              <ChevronRight className="w-4 h-4 text-text-3" />
            </button>

            <button
              onClick={() => showToast('Privacy settings coming soon', 'info')}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-bg transition-colors"
            >
              <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Shield className="w-4 h-4 text-purple-500" />
              </div>
              <span className="flex-1 text-sm font-medium text-text text-left">Privacy & Security</span>
              <ChevronRight className="w-4 h-4 text-text-3" />
            </button>
          </div>
        </div>

        {/* Sign Out */}
        <button
          onClick={handleSignOut}
          disabled={signingOut || loading}
          className="w-full py-3.5 rounded-2xl border-2 border-border text-text-2 font-semibold text-sm hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {signingOut ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <LogOut className="w-4 h-4" />
          )}
          Sign Out
        </button>

        {/* Danger Zone */}
        <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-red-100 bg-red-50">
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">Danger Zone</p>
          </div>
          {showDeleteConfirm ? (
            <div className="p-4">
              <p className="text-sm text-text-2 mb-4">
                This will permanently delete your account and all data. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => showToast('Account deletion coming soon', 'error')}
                  className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700"
                >
                  Delete Account
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2.5 bg-white border border-border text-text rounded-xl text-sm font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-red-50 transition-colors"
            >
              <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-4 h-4 text-red-500" />
              </div>
              <span className="flex-1 text-sm font-medium text-red-600 text-left">Delete Account</span>
              <ChevronRight className="w-4 h-4 text-red-400" />
            </button>
          )}
        </div>

        <p className="text-center text-xs text-text-3">CampusBite v0.1.0</p>
      </div>

      {/* Institute picker bottom sheet */}
      {showInstitutePicker && (
        <InstitutePickerSheet
          currentInstituteId={user?.institute_id ?? null}
          onClose={() => setShowInstitutePicker(false)}
        />
      )}
    </>
  );
}
