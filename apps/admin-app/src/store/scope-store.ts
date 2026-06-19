import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ScopeState {
  instituteId: string | null;
  canteenId: string | null;
  setInstitute: (id: string | null) => void;
  setCanteen: (id: string | null) => void;
}

export const useScopeStore = create<ScopeState>()(
  persist(
    (set) => ({
      instituteId: null,
      canteenId: null,
      setInstitute: (id) => set({ instituteId: id, canteenId: null }),
      setCanteen: (id) => set({ canteenId: id }),
    }),
    { name: 'munchadda-admin-scope' }
  )
);
