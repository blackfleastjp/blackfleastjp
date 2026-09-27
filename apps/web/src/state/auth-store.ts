import { create } from 'zustand';
import type { AuthUser } from '../types';

type AuthState = {
  accessToken: string | null;
  user: AuthUser | null;
  activeCompanyId: string | null;
  initialized: boolean;
  setSession: (accessToken: string, user: AuthUser) => void;
  setActiveCompany: (companyId: string) => void;
  clearSession: () => void;
  setInitialized: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  activeCompanyId: null,
  initialized: false,
  setSession: (accessToken, user) => set({ accessToken, user, activeCompanyId: user.companyId }),
  setActiveCompany: (activeCompanyId) => set({ activeCompanyId }),
  clearSession: () => set({ accessToken: null, user: null, activeCompanyId: null }),
  setInitialized: () => set({ initialized: true }),
}));
