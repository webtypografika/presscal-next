// UI state store — sidebar, modals, theme

import { create } from 'zustand';

interface UIState {
  sidebarCollapsed: boolean;
  theme: 'light' | 'dark';
  activeModal: string | null;

  toggleSidebar: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  openModal: (id: string) => void;
  closeModal: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  theme: 'light',
  activeModal: null,

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setTheme: (theme) => set({ theme }),
  openModal: (id) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),
}));
