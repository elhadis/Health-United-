"use client";

import { useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { OfflineSyncProvider } from "@/components/providers/offline-sync-provider";
import { useAuthStore } from "@/lib/stores/auth-store";

function AuthBootstrap({ children }: { children: ReactNode }) {
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          if (!cancelled) setUser(null);
          return;
        }
        const data = await res.json();
        if (!cancelled && data.user) {
          setUser({
            id: data.user.id,
            name: data.user.name,
            username: data.user.username,
            role: data.user.role,
            pharmacyId: data.user.pharmacyId ?? undefined,
            warehouseId: data.user.warehouseId ?? undefined,
          });
        }
      } catch {
        // keep persisted user if offline
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setUser]);

  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthBootstrap>
        <OfflineSyncProvider>{children}</OfflineSyncProvider>
      </AuthBootstrap>
    </QueryClientProvider>
  );
}
