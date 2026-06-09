'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowRight, Store, Zap } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { CanteenCard } from '@/components/canteen/canteen-card';
import { MenuItemCard } from '@/components/menu/menu-item-card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Canteen, MenuItem } from '@/types';

async function fetchCanteens(): Promise<Canteen[]> {
  const res = await fetch('/api/v1/canteens?limit=6');
  if (!res.ok) throw new Error('Failed to load canteens');
  const json = await res.json();
  return json.data;
}

async function fetchFeaturedItems(): Promise<MenuItem[]> {
  const res = await fetch('/api/v1/canteens?limit=1');
  if (!res.ok) return [];
  const json = await res.json();
  if (!json.data?.[0]) return [];
  const canteenId = json.data[0].id;
  const menuRes = await fetch(
    `/api/v1/canteens/${canteenId}/menu-items?is_featured=true&limit=4`
  );
  if (!menuRes.ok) return [];
  const menuJson = await menuRes.json();
  return menuJson.data ?? [];
}

export default function HomePage() {
  const user = useAuthStore((s) => s.user);

  const { data: canteens, isLoading: canteensLoading } = useQuery({
    queryKey: ['canteens', 'home'],
    queryFn: fetchCanteens,
  });

  const { data: featuredItems, isLoading: featuredLoading } = useQuery({
    queryKey: ['featured-items', 'home'],
    queryFn: fetchFeaturedItems,
  });

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = user?.full_name?.split(' ')[0] ?? 'there';

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-6 space-y-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-brand to-brand-light rounded-2xl p-5 text-white shadow-lg">
        <div className="relative z-10">
          <p className="text-sm font-medium opacity-90 mb-0.5">{greeting()},</p>
          <h1 className="text-xl font-bold">{firstName}! 👋</h1>
          <p className="text-sm mt-1 opacity-80">What are you craving today?</p>
          <Link
            href="/canteens"
            className="mt-3 inline-flex items-center gap-1.5 bg-white text-brand text-sm font-semibold px-4 py-2 rounded-xl hover:bg-brand-pale transition-colors"
          >
            <Store className="w-4 h-4" />
            Browse Canteens
          </Link>
        </div>
        {/* Decorative circles */}
        <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white opacity-10" />
        <div className="absolute -right-4 -bottom-12 w-40 h-40 rounded-full bg-white opacity-10" />
      </div>

      {/* Canteens Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-brand" />
            <h2 className="text-base font-bold text-text">Canteens</h2>
          </div>
          <Link
            href="/canteens"
            className="flex items-center gap-1 text-sm text-brand font-medium hover:text-brand-dark transition-colors"
          >
            See all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {canteensLoading ? (
          <div className="grid grid-cols-1 gap-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : canteens && canteens.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {canteens.map((canteen) => (
              <CanteenCard key={canteen.id} canteen={canteen} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-text-3">
            <Store className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No canteens available right now</p>
          </div>
        )}
      </section>

      {/* Featured Items Section */}
      {(featuredLoading || (featuredItems && featuredItems.length > 0)) && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-brand" />
            <h2 className="text-base font-bold text-text">Featured Items</h2>
          </div>

          {featuredLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {featuredItems?.map((item) => (
                <MenuItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
