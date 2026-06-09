'use client';

import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';
import type { AdminUser } from '@/types';

interface AuthState {
  user: AdminUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setUser: (user: AdminUser | null) => void;
  setLoading: (loading: boolean) => void;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setUser: (user) => set({ user, isAuthenticated: !!user, isLoading: false }),

  setLoading: (isLoading) => set({ isLoading }),

  signOut: async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    set({ user: null, isAuthenticated: false });
  },

  refreshUser: async () => {
    const supabase = createClient();
    set({ isLoading: true });

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      set({ user: null, isAuthenticated: false, isLoading: false });
      return;
    }

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    set({
      user: profile as AdminUser | null,
      isAuthenticated: !!profile,
      isLoading: false,
    });
  },
}));
