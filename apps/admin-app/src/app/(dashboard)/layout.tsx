'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { useUIStore } from '@/store/ui-store';
import { useAuthStore } from '@/store/auth-store';
import { cn } from '@/lib/utils';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/institutes': 'Institutes',
  '/canteens': 'Canteen Management',
  '/orders': 'Orders',
  '/menu': 'Menu Management',
  '/users': 'Users',
  '/staff': 'Staff',
  '/analytics': 'Analytics',
  '/kiosks': 'Kiosks',
  '/settings': 'Settings',
  '/audit-logs': 'Audit Logs',
};

function getTitle(pathname: string): string {
  const exact = PAGE_TITLES[pathname];
  if (exact) return exact;
  const segment = '/' + pathname.split('/')[1];
  return PAGE_TITLES[segment] ?? 'Admin';
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const { refreshUser } = useAuthStore();

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Close the mobile slide-in drawer whenever the route changes, so tapping a
  // nav item doesn't leave the drawer covering the page it navigated to.
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar – desktop always visible, mobile slide-in */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-30 lg:relative lg:flex lg:shrink-0',
          sidebarOpen ? 'flex' : 'hidden lg:flex'
        )}
      >
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header title={getTitle(pathname)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
