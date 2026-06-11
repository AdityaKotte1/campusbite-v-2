'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, ShoppingBag, UtensilsCrossed, Users, UserCheck,
  BarChart3, Monitor, Settings, ClipboardList, LogOut, ChevronLeft,
  Building2, Store, CreditCard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth-store';
import { useUIStore } from '@/store/ui-store';
import { initials } from '@/lib/formatting';

const ALL_NAV = [
  { href: '/dashboard',  label: 'Dashboard',  Icon: LayoutDashboard, roles: ['super_admin', 'canteen_admin', 'staff'] },
  { href: '/institutes', label: 'Institutes', Icon: Building2,       roles: ['super_admin'] },
  { href: '/subscriptions', label: 'Subscriptions', Icon: CreditCard, roles: ['super_admin'] },
  { href: '/canteens',   label: 'Canteens',   Icon: Store,           roles: ['super_admin', 'canteen_admin'] },
  { href: '/orders',     label: 'Orders',     Icon: ShoppingBag,     roles: ['super_admin', 'canteen_admin', 'staff'] },
  { href: '/menu',       label: 'Menu',       Icon: UtensilsCrossed, roles: ['super_admin', 'canteen_admin', 'staff'] },
  { href: '/users',      label: 'Users',      Icon: Users,           roles: ['super_admin', 'canteen_admin'] },
  { href: '/staff',      label: 'Staff',      Icon: UserCheck,       roles: ['super_admin', 'canteen_admin'] },
  { href: '/analytics',  label: 'Analytics',  Icon: BarChart3,       roles: ['super_admin', 'canteen_admin'] },
  { href: '/kiosks',     label: 'Kiosks',     Icon: Monitor,         roles: ['super_admin', 'canteen_admin', 'staff'] },
  { href: '/settings',   label: 'Settings',   Icon: Settings,        roles: ['super_admin', 'canteen_admin'] },
  { href: '/audit-logs', label: 'Audit Logs', Icon: ClipboardList,   roles: ['super_admin'] },
];

export function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const { user, signOut } = useAuthStore();
  const { sidebarCollapsed, toggleCollapsed } = useUIStore();
  const role = (user as { role?: string } | null)?.role ?? '';

  const navItems = ALL_NAV.filter((item) => item.roles.includes(role));

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-surface border-r border-border sidebar-transition',
        sidebarCollapsed ? 'w-16' : 'w-60',
        className
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-border shrink-0">
        <div className="w-8 h-8 rounded-lg bg-brand flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">CB</span>
        </div>
        {!sidebarCollapsed && (
          <span className="text-sm font-bold text-text truncate">CampusBite</span>
        )}
        <button
          onClick={toggleCollapsed}
          className={cn(
            'ml-auto p-1 rounded hover:bg-bg text-text-3 hover:text-text transition',
            sidebarCollapsed && 'hidden'
          )}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Role badge */}
      {!sidebarCollapsed && role && (
        <div className="px-4 py-2 border-b border-border">
          <span
            className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded-full',
              role === 'super_admin'
                ? 'bg-purple-100 text-purple-700'
                : role === 'canteen_admin'
                ? 'bg-brand-pale text-brand'
                : 'bg-bg-2 text-text-3'
            )}
          >
            {role === 'super_admin'
              ? 'Super Admin'
              : role === 'canteen_admin'
              ? 'Canteen Admin'
              : 'Staff'}
          </span>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto">
        <ul className="space-y-0.5">
          {navItems.map(({ href, label, Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            return (
              <li key={href}>
                <Link
                  href={href}
                  title={sidebarCollapsed ? label : undefined}
                  className={cn(
                    'flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-pale text-brand'
                      : 'text-text-2 hover:bg-bg hover:text-text'
                  )}
                >
                  <Icon className={cn('shrink-0', isActive && 'text-brand')} size={18} />
                  {!sidebarCollapsed && <span className="truncate">{label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User footer */}
      <div className="border-t border-border p-3 shrink-0">
        {!sidebarCollapsed ? (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand-pale text-brand flex items-center justify-center text-xs font-semibold shrink-0">
              {initials(user?.full_name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-text truncate">
                {user?.full_name ?? 'Admin'}
              </p>
              <p className="text-xs text-text-3 truncate">{user?.email}</p>
            </div>
            <button
              onClick={signOut}
              title="Sign out"
              className="p-1.5 rounded text-text-3 hover:text-red-600 hover:bg-red-50 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={signOut}
            title="Sign out"
            className="w-full flex justify-center p-1.5 rounded text-text-3 hover:text-red-600 hover:bg-red-50 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
  );
}
