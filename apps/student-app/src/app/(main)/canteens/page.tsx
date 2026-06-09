'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Store, SlidersHorizontal } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import { CanteenCard } from '@/components/canteen/canteen-card';
import { Skeleton } from '@/components/ui/skeleton';
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
    <div className="max-w-lg mx-auto px-4 pt-4 pb-6">
      {/* Page Header */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-text">Canteens</h1>
        <p className="text-sm text-text-2 mt-0.5">Find and order from your campus canteens</p>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search canteens..."
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-white text-sm text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-3 hover:text-text-2 text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-2 mb-4">
        <SlidersHorizontal className="w-4 h-4 text-text-3 flex-shrink-0" />
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          <button
            onClick={() => setFilterOpen(undefined)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              filterOpen === undefined
                ? 'bg-brand text-white border-brand'
                : 'bg-white text-text-2 border-border hover:border-brand-light'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterOpen(true)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              filterOpen === true
                ? 'bg-green text-white border-green'
                : 'bg-white text-text-2 border-border hover:border-green'
            }`}
          >
            Open Now
          </button>
          <button
            onClick={() => setFilterOpen(false)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              filterOpen === false
                ? 'bg-gray-500 text-white border-gray-500'
                : 'bg-white text-text-2 border-border hover:border-gray-400'
            }`}
          >
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
          <p className="text-center text-xs text-text-3 pt-2">
            Showing {canteens.length} canteen{canteens.length !== 1 ? 's' : ''}
            {debouncedSearch ? ` for "${debouncedSearch}"` : ''}
          </p>
        </div>
      ) : (
        <div className="text-center py-16">
          <Store className="w-12 h-12 mx-auto mb-3 text-text-3 opacity-40" />
          <p className="text-text-2 font-medium">No canteens found</p>
          <p className="text-text-3 text-sm mt-1">
            {debouncedSearch
              ? `No results for "${debouncedSearch}"`
              : 'No canteens are available right now'}
          </p>
          {debouncedSearch && (
            <button
              onClick={() => setSearch('')}
              className="mt-3 text-sm text-brand hover:text-brand-dark font-medium"
            >
              Clear search
            </button>
          )}
        </div>
      )}
    </div>
  );
}
