'use client';

import Link from 'next/link';
import { ShoppingCart, User } from 'lucide-react';
import { useCartTotalItems } from '@/store/cart-store';
import { useUIStore } from '@/store/ui-store';
import { useAuthStore } from '@/store/auth-store';
import { cn } from '@/lib/utils';

export function Header() {
  const totalItems = useCartTotalItems();
  const openCart = useUIStore((s) => s.openCart);
  const user = useAuthStore((s) => s.user);

  const initials = user?.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : null;

  return (
    <header className="sticky top-0 z-30 bg-bg/80 backdrop-blur-xl border-b border-border">
      <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center shadow-warm">
            <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
              <path
                d="M10 12C10 11.448 10.448 11 11 11H21C21.552 11 22 11.448 22 12V13C22 16.866 18.866 20 15 20H14C14 21.105 14.895 22 16 22H18C18.552 22 19 22.448 19 23C19 23.552 18.552 24 18 24H14C12.343 24 11 22.657 11 21V20C11 19.448 11.448 19 12 19V13H11C10.448 13 10 12.552 10 12Z"
                fill="white"
              />
              <circle cx="22" cy="9" r="3" fill="#EBC178" />
            </svg>
          </div>
          <span className="font-display text-xl font-semibold text-text tracking-tight">
            Munch<span className="text-brand">Adda</span>
          </span>
        </Link>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Cart */}
          <button
            onClick={openCart}
            className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-brand-pale transition-colors"
            aria-label="Open cart"
          >
            <ShoppingCart className="w-5 h-5 text-text-2" />
            {totalItems > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-brand text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {totalItems > 99 ? '99+' : totalItems}
              </span>
            )}
          </button>

          {/* Profile */}
          <Link
            href="/profile"
            className="w-9 h-9 flex items-center justify-center rounded-full overflow-hidden hover:ring-2 hover:ring-brand transition-all"
            aria-label="Profile"
          >
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.full_name}
                className="w-9 h-9 object-cover"
              />
            ) : initials ? (
              <div className="w-9 h-9 bg-brand flex items-center justify-center rounded-full">
                <span className="text-white text-xs font-bold">{initials}</span>
              </div>
            ) : (
              <div className="w-9 h-9 bg-bg border border-border flex items-center justify-center rounded-full">
                <User className="w-4 h-4 text-text-3" />
              </div>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
