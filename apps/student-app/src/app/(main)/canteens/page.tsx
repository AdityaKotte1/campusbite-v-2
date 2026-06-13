'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Store, SlidersHorizontal } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import { CanteenCard } from '@/components/canteen/canteen-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Canteen } from '@/types';

async function fetchCanteens(search?: string, isOpen?: boolean): Promise<Canteen[]> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (isOpen !== undefined) params.set('is_open', String(isOpen));
  const res = await fetch(`/api/v1/canteens?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch canteens');
  const json = await res.json();
  return json.data;
}

export default function CanteensPage() {
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState<boolean | undefined>(undefined);
  const debouncedSearch = useDebounce(search, 350);

  const { data: canteens, isLoading, isError } = useQuery({
    queryKey: ['canteens', debouncedSearch, filterOpen],
    queryFn: () => fetchCanteens(debouncedSearch, filterOpen),
  });

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-6 animate-fade-up">
      {/* Page Header */}
      <div className="mb-5">
        <p className="eyebrow">Campus Dining</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-text mt-1">
          Canteens
        </h1>
        <div className="rule-amber mt-2.5" />
        <p className="text-sm text-text-2 mt-3">Find and order from your campus canteens</p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3 pointer-events-none z-10" />
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search canteens..."
          aria-label="Search canteens"
          className="pl-10 pr-9"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-2 text-lg leading-none cursor-pointer z-10"
          >
            ×
          </button>
        )}
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-2 mb-6">
        <SlidersHorizontal className="w-4 h-4 text-text-3 flex-shrink-0" />
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setFilterOpen(undefined)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border cursor-pointer ${
              filterOpen === undefined
                ? 'bg-brand text-white border-brand shadow-warm'
                : 'bg-surface text-text-2 border-border-2 hover:border-brand-light hover:text-brand'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterOpen(true)}
            className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border cursor-pointer ${
              filterOpen === true
                ? 'bg-green text-white border-green shadow-sm'
                : 'bg-surface text-text-2 border-border-2 hover:border-green'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${filterOpen === true ? 'bg-white' : 'bg-green'}`} />
            Open Now
          </button>
          <button
            onClick={() => setFilterOpen(false)}
            className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 border cursor-pointer ${
              filterOpen === false
                ? 'bg-text text-white border-text shadow-sm'
                : 'bg-surface text-text-2 border-border-2 hover:border-text-3'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${filterOpen === false ? 'bg-white/70' : 'bg-text-3'}`} />
            Closed
          </button>
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-12">
          <p className="text-text-3 text-sm">Failed to load canteens. Please try again.</p>
        </div>
      ) : canteens && canteens.length > 0 ? (
        <div className="space-y-3">
          {canteens.map((canteen) => (
            <CanteenCard key={canteen.id} canteen={canteen} />
          ))}
          <p className="text-center text-xs text-text-3 pt-3 tabular-nums">
            Showing {canteens.length} canteen{canteens.length !== 1 ? 's' : ''}
            {debouncedSearch ? ` for "${debouncedSearch}"` : ''}
          </p>
        </div>
      ) : (
        <div className="text-center py-16 bg-surface border border-border rounded-2xl px-6">
          <Store className="w-12 h-12 mx-auto mb-3 text-text-3 opacity-40" strokeWidth={1.5} />
          <p className="font-display text-lg font-semibold text-text">No canteens found</p>
          <p className="text-text-3 text-sm mt-1">
            {debouncedSearch
              ? `No results for "${debouncedSearch}"`
              : 'No canteens are available right now'}
          </p>
          {debouncedSearch && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearch('')}
              className="mt-4"
            >
              Clear search
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
