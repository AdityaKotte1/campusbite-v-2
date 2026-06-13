'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowRight, Store, Sparkles, ChefHat } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { CanteenCard } from '@/components/canteen/canteen-card';
import { MenuItemCard } from '@/components/menu/menu-item-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
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
    <div className="max-w-lg mx-auto px-4 pt-5 pb-6 space-y-7">
      {/* Greeting */}
      <header className="animate-fade-up">
        <p className="eyebrow">{greeting()}</p>
        <h1 className="font-display text-[2rem] leading-none font-semibold text-text mt-1.5">
          Hey {firstName}.
        </h1>
        <div className="rule-amber mt-3.5" />
        <p className="text-sm text-text-2 mt-3">What are you craving today?</p>
      </header>

      {/* Editorial hero CTA */}
      <section
        className="relative overflow-hidden rounded-2xl border border-border bg-surface p-6 shadow-sm bg-grain animate-fade-up"
        style={{ animationDelay: '60ms' }}
      >
        <div className="relative z-10 max-w-[78%]">
          <p className="eyebrow text-brand">Fresh from campus</p>
          <h2 className="font-display text-[1.65rem] leading-tight font-semibold text-text mt-2">
            Skip the queue.<br />Eat what&apos;s good today.
          </h2>
          <Button asChild size="md" className="mt-4">
            <Link href="/canteens">
              <Store className="w-4 h-4" />
              Browse canteens
            </Link>
          </Button>
        </div>
        <ChefHat
          className="absolute -right-4 -bottom-5 w-32 h-32 text-brand/10"
          strokeWidth={1.25}
        />
      </section>

      {/* Canteens Section */}
      <section>
        <div className="flex items-end justify-between mb-3.5">
          <div>
            <p className="eyebrow">Where to eat</p>
            <h2 className="font-display text-xl font-semibold text-text mt-0.5">
              Canteens near you
            </h2>
          </div>
          <Link
            href="/canteens"
            className="flex items-center gap-1 text-sm text-brand font-semibold hover:gap-1.5 transition-all pb-1"
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
          <div className="mb-3.5">
            <p className="eyebrow flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-amber" />
              Chef&apos;s picks
            </p>
            <h2 className="font-display text-xl font-semibold text-text mt-0.5">
              Featured today
            </h2>
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
