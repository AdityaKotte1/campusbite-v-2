'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Store, Receipt, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  {
    href: '/',
    label: 'Home',
    icon: Home,
    matchExact: true,
  },
  {
    href: '/canteens',
    label: 'Canteens',
    icon: Store,
    matchExact: false,
  },
  {
    href: '/orders',
    label: 'Orders',
    icon: Receipt,
    matchExact: false,
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: User,
    matchExact: false,
  },
];

export function BottomNav() {
  const pathname = usePathname();

  function isActive(item: typeof NAV_ITEMS[0]): boolean {
    if (item.matchExact) return pathname === item.href;
    return pathname.startsWith(item.href);
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-border">
      <div
        className="max-w-lg mx-auto flex"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex-1 flex flex-col items-center justify-center py-2.5 gap-1',
                'transition-all duration-150 active:scale-95',
                active ? 'text-brand' : 'text-text-3 hover:text-text-2'
              )}
              aria-current={active ? 'page' : undefined}
            >
              {/* Icon with active indicator dot */}
              <div className="relative">
                <Icon
                  className={cn(
                    'w-5 h-5 transition-all',
                    active && 'stroke-[2.5]'
                  )}
                />
                {active && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-brand rounded-full" />
                )}
              </div>
              <span
                className={cn(
                  'text-[10px] font-medium transition-all',
                  active ? 'text-brand' : 'text-text-3'
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
