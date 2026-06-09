import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthActions {
  setUser: (user: User | null) => void;
  clearUser: () => void;
  setLoading: (loading: boolean) => void;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
  immer((set) => ({
    user: null,
    isAuthenticated: false,
    isLoading: true,

    setUser: (user) =>
      set((state) => {
        state.user = user;
        state.isAuthenticated = user !== null;
        state.isLoading = false;
      }),

    clearUser: () =>
      set((state) => {
        state.user = null;
        state.isAuthenticated = false;
        state.isLoading = false;
      }),

    setLoading: (loading) =>
      set((state) => {
        state.isLoading = loading;
      }),
  }))
);
