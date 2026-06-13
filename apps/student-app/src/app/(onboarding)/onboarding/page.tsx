'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MapPin, CheckCircle2, ChevronRight, Loader2, School } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Institute {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
  logo_url: string | null;
}

export default function OnboardingPage() {
  const router = useRouter();

  const [institutes, setInstitutes] = useState<Institute[]>([]);
  const [filtered, setFiltered] = useState<Institute[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Institute | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Fetch institutes on mount
  useEffect(() => {
    fetch('/api/v1/institutes')
      .then((r) => r.json())
      .then((json) => {
        setInstitutes(json.data ?? []);
        setFiltered(json.data ?? []);
      })
      .catch(() => setError('Failed to load institutes. Please refresh.'))
      .finally(() => setLoading(false));
  }, []);

  // Filter on search
  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      setFiltered(institutes);
      return;
    }
    setFiltered(
      institutes.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.city.toLowerCase().includes(q) ||
          i.code.toLowerCase().includes(q)
      )
    );
  }, [search, institutes]);

  const handleContinue = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/v1/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ institute_id: selected.id }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.message ?? 'Failed to save institute');
      }
      router.replace('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setSaving(false);
    }
  }, [selected, router]);

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      {/* Header */}
      <div className="bg-brand px-6 pt-14 pb-9 text-white shadow-warm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70 mb-2">
          Welcome to MunchAdda
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight leading-tight">
          Pick your campus
        </h1>
        <p className="mt-2 text-white/80 text-sm">
          Select your college to see canteens near you.
        </p>
      </div>

      {/* Search */}
      <div className="px-4 -mt-5 z-10 relative">
        <div className="bg-surface rounded-2xl shadow-md border border-border flex items-center gap-3 px-4 py-3">
          <Search className="w-5 h-5 text-text-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by college name or city..."
            aria-label="Search colleges"
            className="flex-1 text-sm bg-transparent outline-none text-text placeholder:text-text-3"
            autoFocus
          />
        </div>
      </div>

      {/* Institute list */}
      <div className="flex-1 px-4 mt-4 pb-36 overflow-y-auto">
        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-brand" />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mx-auto mb-4">
              <School className="w-6 h-6 text-text-3" />
            </div>
            <p className="font-display text-lg font-semibold text-text">No colleges found</p>
            <p className="text-text-3 text-sm mt-1">
              {search ? `No results for "${search}"` : 'No colleges available yet'}
            </p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((institute) => {
              const isSelected = selected?.id === institute.id;
              return (
                <button
                  key={institute.id}
                  onClick={() => setSelected(isSelected ? null : institute)}
                  className={`w-full text-left rounded-2xl border p-4 transition-all duration-150 flex items-center gap-4 cursor-pointer ${
                    isSelected
                      ? 'border-brand bg-brand-pale shadow-sm'
                      : 'border-border bg-surface hover:border-brand/40 hover:shadow-sm'
                  }`}
                >
                  {/* Logo or initials */}
                  <div
                    className={`w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden ${
                      isSelected ? 'bg-brand' : 'bg-bg-2'
                    }`}
                  >
                    {institute.logo_url ? (
                      <img
                        src={institute.logo_url}
                        alt={institute.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span
                        className={`font-display text-lg font-semibold ${
                          isSelected ? 'text-white' : 'text-text-2'
                        }`}
                      >
                        {institute.name.charAt(0)}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-semibold text-sm leading-tight ${
                        isSelected ? 'text-brand' : 'text-text'
                      }`}
                    >
                      {institute.name}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-text-3 flex-shrink-0" />
                      <p className="text-xs text-text-3 truncate">
                        {institute.city}, {institute.state}
                      </p>
                    </div>
                    <p className="text-xs text-text-3 mt-0.5">{institute.code}</p>
                  </div>

                  {/* Check */}
                  {isSelected && (
                    <CheckCircle2 className="w-5 h-5 text-brand flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <p className="text-center text-sm text-red-500 mt-4">{error}</p>
        )}
      </div>

      {/* Bottom CTA — slides up when institute selected */}
      <div
        className={`fixed bottom-0 left-0 right-0 bg-surface border-t border-border px-4 py-4 transition-transform duration-300 ${
          selected ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        {selected && (
          <div className="max-w-sm mx-auto">
            <p className="eyebrow text-text-3 mb-1 text-center">You selected</p>
            <p className="text-sm font-semibold text-text text-center mb-3 truncate">
              {selected.name} — {selected.city}
            </p>
            <Button
              onClick={handleContinue}
              disabled={saving}
              size="lg"
              className="w-full cursor-pointer"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Continue
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
