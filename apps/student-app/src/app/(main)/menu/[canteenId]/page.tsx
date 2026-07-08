'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Clock,
  Star,
  Search,
  ShoppingCart,
  Leaf,
  Drumstick,
  UtensilsCrossed,
  Info,
} from 'lucide-react';
import { CategoryTabs } from '@/components/menu/category-tabs';
import { MenuItemCard } from '@/components/menu/menu-item-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useCartTotalItems } from '@/store/cart-store';
import { useUIStore } from '@/store/ui-store';
import { useDebounce } from '@/hooks/use-debounce';
import type { Canteen, Category, MenuItem } from '@/types';

async function fetchCanteen(id: string): Promise<Canteen> {
  const res = await fetch(`/api/v1/canteens/${id}`);
  if (!res.ok) throw new Error('Canteen not found');
  const json = await res.json();
  return json.data;
}

async function fetchCategories(canteenId: string): Promise<Category[]> {
  const res = await fetch(`/api/v1/canteens/${canteenId}/categories`);
  if (!res.ok) return [];
  const json = await res.json();
  return json.data;
}

async function fetchMenuItems(
  canteenId: string,
  categoryId?: string,
  isVeg?: boolean,
  search?: string
): Promise<MenuItem[]> {
  const params = new URLSearchParams();
  if (categoryId) params.set('category_id', categoryId);
  if (isVeg !== undefined) params.set('is_veg', String(isVeg));
  if (search) params.set('search', search);
  const res = await fetch(`/api/v1/canteens/${canteenId}/menu-items?${params}`);
  if (!res.ok) throw new Error('Failed to load menu');
  const json = await res.json();
  return json.data;
}

interface Props {
  params: { canteenId: string };
}

export default function MenuPage({ params }: Props) {
  const { canteenId } = params;
  const router = useRouter();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(undefined);
  const [vegFilter, setVegFilter] = useState<boolean | undefined>(undefined);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const totalItems = useCartTotalItems();
  const openCart = useUIStore((s) => s.openCart);

  const { data: canteen, isLoading: canteenLoading } = useQuery({
    queryKey: ['canteen', canteenId],
    queryFn: () => fetchCanteen(canteenId),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories', canteenId],
    queryFn: () => fetchCategories(canteenId),
  });

  const { data: menuItems, isLoading: menuLoading } = useQuery({
    queryKey: ['menu-items', canteenId, selectedCategoryId, vegFilter, debouncedSearch],
    queryFn: () => fetchMenuItems(canteenId, selectedCategoryId, vegFilter, debouncedSearch),
  });

  const selectedCategory = categories?.find((c) => c.id === selectedCategoryId);

  return (
    <div className="max-w-lg mx-auto pb-6">
      {/* Canteen Header */}
      <div className="relative">
        {canteenLoading ? (
          <Skeleton className="w-full h-40" />
        ) : (
          <div className="relative w-full h-40 bg-brand-pale">
            {canteen?.image_url ? (
              <Image
                src={canteen.image_url}
                alt={canteen.name}
                fill
                className="object-cover"
                sizes="100vw"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <UtensilsCrossed className="w-12 h-12 text-brand/40" strokeWidth={1.5} />
              </div>
            )}
          </div>
        )}

        {/* Back button */}
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          className="absolute top-3 left-3 w-9 h-9 bg-surface/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md hover:bg-surface transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-text" />
        </button>
      </div>

      {/* Canteen info — premium editorial block */}
      {canteen && (
        <div className="bg-surface border-b border-border px-4 pt-4 pb-3 animate-fade-up">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="eyebrow">Menu</p>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-text leading-tight mt-0.5">
                {canteen.name}
              </h1>
            </div>
            <span
              className={`flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                canteen.is_open
                  ? 'bg-green-light text-green-dark'
                  : 'bg-bg-2 text-text-3'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${canteen.is_open ? 'bg-green' : 'bg-text-3'}`} />
              {canteen.is_open ? 'Open' : 'Closed'}
            </span>
          </div>
          <div className="flex items-center gap-4 mt-2 text-text-2">
            {canteen.rating > 0 && (
              <span className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-amber text-amber" />
                <span className="font-display text-sm font-semibold text-text tabular-nums">
                  {canteen.rating.toFixed(1)}
                </span>
                {canteen.total_reviews > 0 && (
                  <span className="text-xs text-text-3 tabular-nums">({canteen.total_reviews})</span>
                )}
              </span>
            )}
            {canteen.opens_at && (
              <span className="flex items-center gap-1 text-xs text-text-3">
                <Clock className="w-3.5 h-3.5" />
                <span className="tabular-nums">{canteen.opens_at} – {canteen.closes_at}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Sticky filters section */}
      <div className="sticky top-14 z-30 bg-bg pt-3 pb-3 px-4 space-y-2.5 border-b border-border shadow-sm">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3 pointer-events-none z-10" />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items..."
            aria-label="Search menu items"
            className="pl-10 pr-9 py-2.5"
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

        {/* Veg filter */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVegFilter(undefined)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 cursor-pointer ${
              vegFilter === undefined
                ? 'bg-text text-white border-text shadow-sm'
                : 'bg-surface text-text-2 border-border-2 hover:border-text-3'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setVegFilter(true)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 cursor-pointer ${
              vegFilter === true
                ? 'bg-green text-white border-green shadow-sm'
                : 'bg-surface text-text-2 border-border-2 hover:border-green'
            }`}
          >
            <Leaf className="w-3 h-3" />
            Veg
          </button>
          <button
            onClick={() => setVegFilter(false)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 cursor-pointer ${
              vegFilter === false
                ? 'bg-red-600 text-white border-red-600 shadow-sm'
                : 'bg-surface text-text-2 border-border-2 hover:border-red-400'
            }`}
          >
            <Drumstick className="w-3 h-3" />
            Non-Veg
          </button>
        </div>

        {/* Category Tabs */}
        {categories && categories.length > 0 && (
          <CategoryTabs
            categories={categories}
            selectedId={selectedCategoryId}
            onSelect={(id) => setSelectedCategoryId(id === selectedCategoryId ? undefined : id)}
          />
        )}
      </div>

      {/* Menu Items */}
      <div className="px-4 pt-4">
        {selectedCategory?.separate_billing && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-light bg-amber-pale px-3 py-2 text-xs text-amber-dark">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              <span className="font-semibold">{selectedCategory.name}</span> is ordered
              separately — these items can&apos;t share a cart with items from other
              categories.
            </span>
          </div>
        )}
        {menuLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        ) : menuItems && menuItems.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {menuItems.map((item) => (
              <MenuItemCard key={item.id} item={item} disabled={!canteen?.is_open} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-surface border border-border rounded-2xl px-6">
            <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 text-text-3 opacity-40" strokeWidth={1.5} />
            <p className="font-display text-lg font-semibold text-text">No items found</p>
            <p className="text-text-3 text-sm mt-1">
              {debouncedSearch ? `No results for "${debouncedSearch}"` : 'No items in this category'}
            </p>
          </div>
        )}
      </div>

      {/* Cart FAB */}
      {totalItems > 0 && (
        <button
          onClick={openCart}
          aria-label="View cart"
          className="fixed bottom-20 right-4 z-40 flex items-center gap-2 bg-brand text-white px-4 py-3 rounded-2xl shadow-warm hover:bg-brand-dark hover:shadow-lg transition-all duration-150 cursor-pointer active:scale-[0.98]"
        >
          <ShoppingCart className="w-5 h-5" />
          <span className="font-semibold text-sm tabular-nums">{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
          <span className="bg-white/20 px-2 py-0.5 rounded-xl text-xs font-medium">View Cart</span>
        </button>
      )}
    </div>
  );
}
