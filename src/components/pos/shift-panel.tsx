"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Play, Square, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";

export type ActiveShift = {
  id: string;
  cashierName: string;
  status: "OPEN" | "CLOSED";
  startedAt: string;
  endedAt: string | null;
  totalSales: number;
  totalCash: number;
  totalBank: number;
  salesCount: number;
};

async function fetchCurrentShift() {
  const res = await fetch("/api/shifts?current=1");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "فشل جلب الوردية");
  return (data.shift ?? null) as ActiveShift | null;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ar-SD", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function PosShiftPanel({
  cashierName,
  requireShift,
}: {
  cashierName: string;
  requireShift?: boolean;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [summary, setSummary] = useState<ActiveShift | null>(null);

  const { data: shift = null, isLoading } = useQuery({
    queryKey: ["current-shift"],
    queryFn: fetchCurrentShift,
    refetchInterval: 30_000,
  });

  const openShift = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/shifts", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "فشل فتح الوردية");
      setMsg("تم فتح الوردية بنجاح");
      void queryClient.invalidateQueries({ queryKey: ["current-shift"] });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "فشل فتح الوردية");
    } finally {
      setBusy(false);
    }
  };

  const closeShift = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/shifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: shift?.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "فشل إغلاق الوردية");
      setSummary(data.shift as ActiveShift);
      setMsg("تم إغلاق الوردية");
      void queryClient.invalidateQueries({ queryKey: ["current-shift"] });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "فشل إغلاق الوردية");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="no-print border-primary/20 bg-gradient-to-l from-white to-teal-50/60">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={shift?.status === "OPEN" ? "success" : "secondary"}>
                <Clock className="h-3.5 w-3.5" />
                {isLoading
                  ? "..."
                  : shift?.status === "OPEN"
                    ? "وردية مفتوحة"
                    : "لا توجد وردية مفتوحة"}
              </Badge>
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <UserIcon className="h-3.5 w-3.5" />
                {cashierName}
              </span>
            </div>
            {shift?.status === "OPEN" ? (
              <div className="text-xs text-slate-600 sm:text-sm">
                <p>بداية الوردية: {formatDateTime(shift.startedAt)}</p>
                <p className="mt-0.5">
                  مبيعات حالية: {formatCurrency(shift.totalSales)} · نقدي{" "}
                  {formatCurrency(shift.totalCash)} · بنكي{" "}
                  {formatCurrency(shift.totalBank)}
                </p>
              </div>
            ) : (
              requireShift && (
                <p className="text-xs text-amber-700">
                  يجب فتح وردية قبل إتمام عمليات البيع
                </p>
              )
            )}
            {msg && <p className="text-xs text-slate-500">{msg}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {shift?.status === "OPEN" ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={busy}
                onClick={closeShift}
              >
                <Square className="h-3.5 w-3.5" />
                إغلاق الوردية
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={busy || isLoading}
                onClick={openShift}
              >
                <Play className="h-3.5 w-3.5" />
                فتح وردية
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!summary}
        onOpenChange={(open) => {
          if (!open) setSummary(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ملخص إغلاق الوردية</DialogTitle>
          </DialogHeader>
          {summary && (
            <div className="space-y-3 text-sm">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p>
                  <span className="text-slate-500">الكاشير: </span>
                  <span className="font-semibold">{summary.cashierName}</span>
                </p>
                <p className="mt-2">
                  <span className="text-slate-500">بداية الوردية: </span>
                  {formatDateTime(summary.startedAt)}
                </p>
                <p className="mt-1">
                  <span className="text-slate-500">نهاية الوردية: </span>
                  {summary.endedAt
                    ? formatDateTime(summary.endedAt)
                    : "—"}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-primary/10 p-3 text-center">
                  <p className="text-xs text-slate-500">إجمالي المبيعات</p>
                  <p className="mt-1 font-bold text-primary">
                    {formatCurrency(summary.totalSales)}
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-3 text-center">
                  <p className="text-xs text-slate-500">نقدي</p>
                  <p className="mt-1 font-bold text-emerald-700">
                    {formatCurrency(summary.totalCash)}
                  </p>
                </div>
                <div className="rounded-xl bg-indigo-50 p-3 text-center">
                  <p className="text-xs text-slate-500">تحويلات بنكية</p>
                  <p className="mt-1 font-bold text-indigo-700">
                    {formatCurrency(summary.totalBank)}
                  </p>
                </div>
              </div>
              <p className="text-center text-xs text-slate-500">
                عدد الفواتير: {summary.salesCount}
              </p>
              <Button
                type="button"
                className="w-full"
                onClick={() => setSummary(null)}
              >
                تم
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
