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
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-bg/85 backdrop-blur-xl border-t border-border">
      <div
        className="max-w-lg mx-auto flex px-2"
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
                'flex-1 flex flex-col items-center justify-center pt-2 pb-1.5 gap-1',
                'transition-all duration-200 active:scale-90',
                active ? 'text-brand' : 'text-text-3 hover:text-text-2'
              )}
              aria-current={active ? 'page' : undefined}
            >
              {/* Icon inside an editorial pill when active */}
              <div
                className={cn(
                  'flex items-center justify-center h-7 w-12 rounded-full transition-all duration-200',
                  active ? 'bg-brand-pale' : 'bg-transparent'
                )}
              >
                <Icon
                  className={cn(
                    'w-5 h-5 transition-all',
                    active && 'stroke-[2.4]'
                  )}
                />
              </div>
              <span
                className={cn(
                  'text-[10px] tracking-wide transition-all',
                  active ? 'font-semibold text-brand' : 'font-medium text-text-3'
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
