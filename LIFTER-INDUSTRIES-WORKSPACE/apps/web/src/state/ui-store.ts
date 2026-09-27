import { create } from "zustand";

interface UiState {
  selectedCompanyId: string | null;
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  setSelectedCompanyId: (companyId: string) => void;
  toggleSidebar: () => void;
  setMobileNavOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedCompanyId: null,
  sidebarCollapsed: false,
  mobileNavOpen: false,
  setSelectedCompanyId: (selectedCompanyId) => set({ selectedCompanyId }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
}));
