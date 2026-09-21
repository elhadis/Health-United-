import { create } from "zustand";

type NetworkState = {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
  lastSyncResult: string | null;
  setOnline: (online: boolean) => void;
  setSyncing: (syncing: boolean) => void;
  setPendingCount: (count: number) => void;
  setLastSync: (at: string | null, result?: string | null) => void;
};

export const useNetworkStore = create<NetworkState>((set) => ({
  // Always start with a stable SSR/client default; real status is set after mount
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  lastSyncAt: null,
  lastSyncResult: null,
  setOnline: (isOnline) => set({ isOnline }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setPendingCount: (pendingCount) => set({ pendingCount }),
  setLastSync: (lastSyncAt, lastSyncResult = null) =>
    set({ lastSyncAt, lastSyncResult }),
}));
