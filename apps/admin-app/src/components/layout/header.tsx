'use client';

import { Bell, Menu, ChevronLeft } from 'lucide-react';
import { useUIStore } from '@/store/ui-store';
import { useAuthStore } from '@/store/auth-store';
import { initials } from '@/lib/formatting';

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const { toggleSidebar, sidebarCollapsed, toggleCollapsed } = useUIStore();
  const { user } = useAuthStore();

  return (
    <header className="h-16 bg-surface/80 backdrop-blur-xl border-b border-border flex items-center px-6 gap-4 shrink-0 sticky top-0 z-20">
      {/* Mobile menu toggle */}
      <button
        onClick={toggleSidebar}
        className="lg:hidden p-2 rounded-lg text-text-2 hover:bg-bg transition"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Desktop sidebar collapse toggle */}
      {sidebarCollapsed && (
        <button
          onClick={toggleCollapsed}
          className="hidden lg:flex p-1.5 rounded text-text-3 hover:bg-bg transition"
          title="Expand sidebar"
        >
          <ChevronLeft className="w-4 h-4 rotate-180" />
        </button>
      )}

      <h1 className="font-display text-xl font-semibold text-text flex-1 tracking-tight">{title}</h1>

      <div className="flex items-center gap-3">
        {/* Notifications */}
        <button className="relative p-2 rounded-lg text-text-2 hover:bg-bg transition">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-brand rounded-full" />
        </button>

        {/* Avatar */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-brand-pale text-brand flex items-center justify-center text-xs font-semibold">
            {initials(user?.full_name)}
          </div>
          <div className="hidden md:block">
            <p className="text-xs font-semibold text-text leading-none">{user?.full_name ?? 'Admin'}</p>
            <p className="text-xs text-text-3 mt-0.5 capitalize">{user?.role?.replace('_', ' ')}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
