"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Role } from "@/lib/auth-session";

export type AppUser = {
  id: string;
  name: string;
  username: string;
  role: Role;
  pharmacyId?: string;
  warehouseId?: string;
};

type AuthState = {
  user: AppUser | null;
  hydrated: boolean;
  setUser: (user: AppUser | null) => void;
  setHydrated: (value: boolean) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      hydrated: false,
      setUser: (user) => set({ user }),
      setHydrated: (hydrated) => set({ hydrated }),
      logout: () => set({ user: null }),
    }),
    {
      name: "pharmacy-auth-user",
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);

export function roleLabel(role: Role): string {
  if (role === "ADMINISTRATOR") return "مسؤول النظام";
  if (role === "ADMIN") return "مدير فرع / مستودع";
  return "كاشير صيدلية";
}

/** Only the super admin may see or trigger permanent delete actions in the UI. */
export function canDeleteRecords(role?: Role | null): boolean {
  return role === "ADMINISTRATOR";
}
