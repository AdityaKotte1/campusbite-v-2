import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

type ToastType = 'success' | 'error' | 'info';

interface ToastState {
  message: string;
  type: ToastType;
}

interface UIState {
  isCartOpen: boolean;
  isLoading: boolean;
  toast: ToastState | null;
}

interface UIActions {
  openCart: () => void;
  closeCart: () => void;
  setLoading: (loading: boolean) => void;
  showToast: (message: string, type?: ToastType) => void;
  clearToast: () => void;
}

type UIStore = UIState & UIActions;

export const useUIStore = create<UIStore>()(
  immer((set) => ({
    isCartOpen: false,
    isLoading: false,
    toast: null,

    openCart: () =>
      set((state) => {
        state.isCartOpen = true;
      }),

    closeCart: () =>
      set((state) => {
        state.isCartOpen = false;
      }),

    setLoading: (loading) =>
      set((state) => {
        state.isLoading = loading;
      }),

    showToast: (message, type = 'info') =>
      set((state) => {
        state.toast = { message, type };
      }),

    clearToast: () =>
      set((state) => {
        state.toast = null;
      }),
  }))
);
