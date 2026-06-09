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
} from 'lucide-react';
import { CategoryTabs } from '@/components/menu/category-tabs';
import { MenuItemCard } from '@/components/menu/menu-item-card';
import { Skeleton } from '@/components/ui/skeleton';
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

  return (
    <div className="max-w-lg mx-auto pb-6">
      {/* Canteen Header */}
      <div className="relative">
        {canteenLoading ? (
          <Skeleton className="w-full h-40" />
        ) : (
          <div className="relative w-full h-40 bg-gradient-to-r from-brand to-brand-light">
            {canteen?.image_url && (
              <Image
                src={canteen.image_url}
                alt={canteen.name}
                fill
                className="object-cover"
                sizes="100vw"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          </div>
        )}

        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="absolute top-3 left-3 w-9 h-9 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-md hover:bg-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-text" />
        </button>

        {/* Canteen info overlay */}
        {canteen && (
          <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
            <div className="flex items-end justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold leading-tight">{canteen.name}</h1>
                <div className="flex items-center gap-3 mt-1 text-xs text-white/80">
                  {canteen.rating > 0 && (
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                      {canteen.rating.toFixed(1)}
                      {canteen.total_reviews > 0 && ` (${canteen.total_reviews})`}
                    </span>
                  )}
                  {canteen.opens_at && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {canteen.opens_at} – {canteen.closes_at}
                    </span>
                  )}
                </div>
              </div>
              <span
                className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  canteen.is_open
                    ? 'bg-green text-white'
                    : 'bg-gray-600 text-white'
                }`}
              >
                {canteen.is_open ? 'Open' : 'Closed'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Sticky filters section */}
      <div className="sticky top-14 z-30 bg-bg pt-3 pb-2 px-4 space-y-2 border-b border-border shadow-sm">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-3 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-white text-sm text-text placeholder:text-text-3 focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
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

        {/* Veg filter */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setVegFilter(undefined)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              vegFilter === undefined
                ? 'bg-text text-white border-text'
                : 'bg-white text-text-2 border-border'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setVegFilter(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              vegFilter === true
                ? 'bg-green text-white border-green'
                : 'bg-white text-text-2 border-border'
            }`}
          >
            <Leaf className="w-3 h-3" />
            Veg
          </button>
          <button
            onClick={() => setVegFilter(false)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              vegFilter === false
                ? 'bg-red-600 text-white border-red-600'
                : 'bg-white text-text-2 border-border'
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
          <div className="text-center py-12">
            <p className="text-text-2 font-medium">No items found</p>
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
          className="fixed bottom-20 right-4 z-40 flex items-center gap-2 bg-brand text-white px-4 py-3 rounded-2xl shadow-xl hover:bg-brand-dark transition-all"
        >
          <ShoppingCart className="w-5 h-5" />
          <span className="font-semibold text-sm">{totalItems} item{totalItems !== 1 ? 's' : ''}</span>
          <span className="bg-white/20 px-2 py-0.5 rounded-xl text-xs">View Cart</span>
        </button>
      )}
    </div>
  );
}
