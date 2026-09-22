"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, ShoppingBag, Boxes, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

type RangeKey = "today" | "week" | "month";

type ReceptionProduct = {
  productId: string;
  productName: string;
  unitType: string;
  receivedPeriod: number;
  soldPeriod: number;
  receivedAll: number;
  soldAll: number;
  remaining: number;
  pharmacyStock: number;
};

type ReceptionReport = {
  range: RangeKey;
  summary: {
    totalReceivedPeriod: number;
    totalSoldPeriod: number;
    totalRemaining: number;
    productCount: number;
  };
  products: ReceptionProduct[];
  receipts: Array<{
    orderNumber: string;
    confirmedAt: string;
    productName: string;
    quantity: number;
    unitType: string;
  }>;
};

async function fetchReceptionReport(range: RangeKey, pharmacyId?: string | null) {
  const params = new URLSearchParams({ range });
  if (pharmacyId) params.set("pharmacyId", pharmacyId);
  const res = await fetch(`/api/reception-report?${params.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "فشل جلب تقرير الاستلام");
  return data as ReceptionReport;
}

function rangeLabel(range: RangeKey) {
  if (range === "today") return "اليوم";
  if (range === "week") return "الأسبوع";
  return "الشهر";
}

export function ReceptionReportsTab({
  pharmacyId,
}: {
  pharmacyId?: string | null;
}) {
  const [range, setRange] = useState<RangeKey>("week");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["reception-report", range, pharmacyId ?? ""],
    queryFn: () => fetchReceptionReport(range, pharmacyId),
    refetchOnMount: "always",
    staleTime: 0,
  });

  return (
    <div className="space-y-4 no-print">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["today", "اليوم"],
            ["week", "الأسبوع"],
            ["month", "الشهر"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={range === key ? "default" : "outline"}
            onClick={() => setRange(key)}
          >
            {label}
          </Button>
        ))}
        {isFetching && (
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        )}
      </div>

      {isLoading && !data && (
        <p className="text-sm text-slate-500">جاري تحميل تقرير الاستلام...</p>
      )}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-emerald-50 p-2">
                  <Package className="h-4 w-4 text-emerald-700" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">
                    المستلم المؤكد — {rangeLabel(range)}
                  </p>
                  <p className="text-xl font-bold">
                    {data.summary.totalReceivedPeriod}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-amber-50 p-2">
                  <ShoppingBag className="h-4 w-4 text-amber-700" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">
                    المباع (POS) — {rangeLabel(range)}
                  </p>
                  <p className="text-xl font-bold">
                    {data.summary.totalSoldPeriod}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-indigo-50 p-2">
                  <Boxes className="h-4 w-4 text-indigo-700" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">إجمالي المتبقي الحالي</p>
                  <p className="text-xl font-bold">
                    {data.summary.totalRemaining}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                المتبقي الحالي من كل منتج
              </CardTitle>
              <p className="text-xs text-slate-500">
                المتبقي = إجمالي المستلم المؤكد − إجمالي المباع في نقطة البيع
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.products.length === 0 && (
                <p className="text-sm text-slate-500">
                  لا توجد بيانات استلام أو مبيعات في هذه الفترة
                </p>
              )}
              {data.products.map((row) => (
                <div
                  key={row.productId}
                  className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-semibold text-secondary">
                      {row.productName}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-500">
                      <Badge variant="outline">
                        مستلم ({rangeLabel(range)}): {row.receivedPeriod}
                      </Badge>
                      <Badge variant="outline">
                        مباع ({rangeLabel(range)}): {row.soldPeriod}
                      </Badge>
                      <Badge variant="outline">{row.unitType}</Badge>
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-xs text-slate-500">المتبقي الحالي</p>
                    <p className="text-lg font-bold text-primary">
                      {row.remaining}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                سجل الاستلام المؤكد — {rangeLabel(range)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.receipts.length === 0 && (
                <p className="text-sm text-slate-500">
                  لا توجد تحويلات مؤكدة في هذه الفترة
                </p>
              )}
              {data.receipts.map((r, idx) => (
                <div
                  key={`${r.orderNumber}-${idx}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{r.orderNumber}</p>
                    <p className="text-xs text-slate-500">
                      {formatDate(r.confirmedAt)} · {r.productName}
                    </p>
                  </div>
                  <Badge variant="success">
                    +{r.quantity} {r.unitType}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
