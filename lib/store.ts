"use client";

import { create } from "zustand";

type Role = "company" | "contractor";

type AppState = {
  role: Role;
  sidebarCollapsed: boolean;
  toasts: Array<{ id: string; type: "success" | "error" | "info"; message: string }>;
  setRole: (role: Role) => void;
  toggleSidebar: () => void;
  pushToast: (toast: Omit<AppState["toasts"][number], "id">) => void;
  dismissToast: (id: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  role: "company",
  sidebarCollapsed: false,
  toasts: [],
  setRole: (role) => set({ role }),
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  pushToast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id: crypto.randomUUID() }].slice(-4),
    })),
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
