"use client";

import { useEffect, type ReactNode } from "react";
import {
  getPendingCount,
  syncOfflineSales,
} from "@/lib/offline/db";
import { useNetworkStore } from "@/lib/stores/network-store";

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const { setOnline, setSyncing, setPendingCount, setLastSync } = useNetworkStore();

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    const refreshPending = async () => {
      const count = await getPendingCount();
      setPendingCount(count);
    };

    const runSync = async () => {
      if (!navigator.onLine) return;
      setSyncing(true);
      try {
        const result = await syncOfflineSales();
        setLastSync(
          new Date().toISOString(),
          result.failed > 0
            ? `فشل ${result.failed} | نجح ${result.synced}`
            : result.synced > 0
              ? `تمت مزامنة ${result.synced} عملية`
              : null
        );
      } finally {
        setSyncing(false);
        await refreshPending();
      }
    };

    updateOnline();
    refreshPending();

    const onOnline = () => {
      updateOnline();
      void runSync();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", updateOnline);

    const interval = window.setInterval(() => {
      void refreshPending();
      if (navigator.onLine) void runSync();
    }, 30_000);

    if (navigator.onLine) void runSync();

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", updateOnline);
      window.clearInterval(interval);
    };
  }, [setOnline, setSyncing, setPendingCount, setLastSync]);

  return <>{children}</>;
}
