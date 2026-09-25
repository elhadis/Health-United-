"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function WarehouseError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[warehouse] render error:", error);
    const isChunkError =
      error?.name === "ChunkLoadError" ||
      /Loading chunk|Failed to fetch dynamically imported module/i.test(error?.message ?? "");
    if (isChunkError && !sessionStorage.getItem("warehouse-chunk-reload")) {
      sessionStorage.setItem("warehouse-chunk-reload", "1");
      window.location.reload();
    }
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
          <div className="rounded-xl bg-danger/10 p-3 text-danger">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <p className="text-sm text-slate-600">
            حدث خطأ أثناء تحميل صفحة المستودع
          </p>
          <Button onClick={reset}>إعادة المحاولة</Button>
        </CardContent>
      </Card>
    </div>
  );
}
