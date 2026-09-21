"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import { useNetworkStore } from "@/lib/stores/network-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { syncOfflineSales, getPendingCount } from "@/lib/offline/db";

export function NetworkStatus() {
  const [hasMounted, setHasMounted] = useState(false);
  const {
    isOnline,
    isSyncing,
    pendingCount,
    setSyncing,
    setPendingCount,
    setLastSync,
  } = useNetworkStore();

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const handleManualSync = async () => {
    if (!isOnline || isSyncing) return;
    setSyncing(true);
    try {
      const result = await syncOfflineSales();
      setLastSync(
        new Date().toISOString(),
        result.synced > 0 ? `تمت مزامنة ${result.synced}` : null
      );
      setPendingCount(await getPendingCount());
    } finally {
      setSyncing(false);
    }
  };

  if (!hasMounted) {
    return null;
  }

  return (
    <div className="space-y-2" suppressHydrationWarning>
      <div suppressHydrationWarning>
        {isOnline ? (
          <Badge className="w-full justify-center border-emerald-400/30 bg-emerald-500/15 text-emerald-300">
            <Wifi className="h-3.5 w-3.5" />
            متصل بالشبكة
          </Badge>
        ) : (
          <Badge className="w-full animate-pulse justify-center border-red-400/30 bg-red-500/15 text-red-300">
            <WifiOff className="h-3.5 w-3.5" />
            وضع عدم الاتصال
          </Badge>
        )}
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2 py-1.5 text-xs text-slate-300">
          <span>{pendingCount} مبيعات بانتظار المزامنة</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-emerald-300 hover:bg-white/10 hover:text-emerald-200"
            onClick={handleManualSync}
            disabled={!isOnline || isSyncing}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            مزامنة
          </Button>
        </div>
      )}

      {isSyncing && pendingCount === 0 && (
        <div className="flex items-center gap-2 text-xs text-emerald-300">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          جاري المزامنة...
        </div>
      )}
    </div>
  );
}
