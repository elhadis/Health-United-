"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Package,
  ShoppingBag,
  Boxes,
  Loader2,
  FileDown,
  PackageX,
  CalendarX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatDate } from "@/lib/utils";
import {
  downloadTabularReportPdf,
  type TabularReportPayload,
} from "@/lib/pdf/official-pdf";

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

type OutOfStockItem = {
  productId: string;
  productName: string;
  unitType: string;
  receivedAll: number;
  soldAll: number;
  lastSoldAt: string | null;
  depletedAt: string | null;
};

type ExpiringItem = {
  batchId: string;
  batchNumber: string;
  productName: string;
  unitType: string;
  quantity: number;
  costPrice: number;
  expiryDate: string;
  daysLeft: number;
  expired: boolean;
};

type ReceptionReport = {
  range: RangeKey;
  from?: string;
  to?: string;
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
  outOfStock?: OutOfStockItem[];
  expiring?: ExpiringItem[];
  expiryHorizonDays?: number;
};

type DetailKey = "received" | "sold" | "remaining";
type AlertTab = "outOfStock" | "expiring";
type ExpiryFilter = "all" | "expired" | "near";

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

const RANGE_LABELS_EN: Record<RangeKey, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
};

const DETAIL_META: Record<
  DetailKey,
  { title: string; titleEn: string; file: string }
> = {
  received: {
    title: "المستلم المؤكد",
    titleEn: "Confirmed Received Report",
    file: "received",
  },
  sold: { title: "المباع (POS)", titleEn: "POS Sold Report", file: "sold" },
  remaining: {
    title: "المتبقي الحالي من كل منتج",
    titleEn: "Current Remaining Stock Report",
    file: "remaining",
  },
};

const pdfDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB");

const pdfMoney = (n: number) =>
  `${Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} SDG`;

const interactiveCardClass =
  "cursor-pointer transition-all hover:shadow-md hover:ring-2 hover:ring-primary/25 active:scale-[0.99]";

export function ReceptionReportsTab({
  pharmacyId,
}: {
  pharmacyId?: string | null;
}) {
  const [range, setRange] = useState<RangeKey>("week");
  const [detail, setDetail] = useState<DetailKey | null>(null);
  const [alertTab, setAlertTab] = useState<AlertTab>("outOfStock");
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("all");
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["reception-report", range, pharmacyId ?? ""],
    queryFn: () => fetchReceptionReport(range, pharmacyId),
    refetchOnMount: "always",
    refetchInterval: 15_000,
    staleTime: 0,
  });

  const outOfStock = useMemo(() => data?.outOfStock ?? [], [data]);
  const expiring = useMemo(() => data?.expiring ?? [], [data]);
  const expiredCount = expiring.filter((e) => e.expired).length;
  const filteredExpiring = useMemo(
    () =>
      expiring.filter((e) =>
        expiryFilter === "all"
          ? true
          : expiryFilter === "expired"
            ? e.expired
            : !e.expired
      ),
    [expiring, expiryFilter]
  );

  const detailRows = useMemo(() => {
    const products = data?.products ?? [];
    if (detail === "received") return products.filter((p) => p.receivedPeriod > 0);
    if (detail === "sold") return products.filter((p) => p.soldPeriod > 0);
    return products;
  }, [data, detail]);

  const detailTotals = useMemo(
    () => ({
      received: detailRows.reduce((s, p) => s + p.receivedPeriod, 0),
      sold: detailRows.reduce((s, p) => s + p.soldPeriod, 0),
      remaining: detailRows.reduce((s, p) => s + p.remaining, 0),
    }),
    [detailRows]
  );

  const periodMeta = () => {
    const from = data?.from;
    const to = data?.to;
    return [
      {
        label: "Period / الفترة",
        value: `${RANGE_LABELS_EN[range]} · ${rangeLabel(range)}`,
      },
      ...(from && to
        ? [{ label: "Range / النطاق", value: `${pdfDate(from)} - ${pdfDate(to)}` }]
        : []),
    ];
  };

  const basePayload = () => ({
    reference: `RCV-${Date.now().toString(36).toUpperCase()}`,
    date: new Date().toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  });

  const runPdf = async (
    key: string,
    payload: TabularReportPayload,
    filename: string
  ) => {
    setPdfBusy(key);
    setPdfError(null);
    try {
      await downloadTabularReportPdf(payload, filename);
    } catch (err) {
      console.error("[reception pdf]", err);
      setPdfError("تعذر إنشاء ملف PDF، حاول مرة أخرى");
    } finally {
      setPdfBusy(null);
    }
  };

  const stamp = () => new Date().toISOString().slice(0, 10);

  const exportDetailPdf = (key: DetailKey) => {
    if (!data) return;
    const products = data.products;
    const rows =
      key === "received"
        ? products.filter((p) => p.receivedPeriod > 0)
        : key === "sold"
          ? products.filter((p) => p.soldPeriod > 0)
          : products;
    const meta = DETAIL_META[key];
    void runPdf(
      key,
      {
        ...basePayload(),
        title: meta.titleEn,
        titleAr: meta.title,
        meta: [
          ...periodMeta(),
          { label: "Products / المنتجات", value: String(rows.length) },
        ],
        summaryCards: [
          {
            labelEn: "Received",
            labelAr: "المستلم المؤكد",
            value: String(rows.reduce((s, p) => s + p.receivedPeriod, 0)),
          },
          {
            labelEn: "Sold (POS)",
            labelAr: "المباع",
            value: String(rows.reduce((s, p) => s + p.soldPeriod, 0)),
          },
          {
            labelEn: "Remaining",
            labelAr: "المتبقي الحالي",
            value: String(rows.reduce((s, p) => s + p.remaining, 0)),
          },
        ],
        sections: [
          {
            heading: "Product Balances",
            headingAr: "أرصدة المنتجات",
            columns: [
              { en: "Product", ar: "المنتج", width: 0.34 },
              { en: "Unit", ar: "الوحدة", width: 0.14, align: "center" },
              { en: "Received", ar: "المستلم", width: 0.16, align: "center" },
              { en: "Sold", ar: "المباع", width: 0.16, align: "center" },
              { en: "Remaining", ar: "المتبقي", width: 0.2, align: "center" },
            ],
            rows: rows.map((p) => [
              p.productName,
              p.unitType,
              String(p.receivedPeriod),
              String(p.soldPeriod),
              String(p.remaining),
            ]),
            emptyText: "لا توجد بيانات في هذه الفترة",
          },
        ],
        notes: "المتبقي = إجمالي المستلم المؤكد ناقص إجمالي المباع",
      },
      `cashier-${meta.file}-${range}-${stamp()}.pdf`
    );
  };

  const exportOutOfStockPdf = () => {
    void runPdf(
      "outOfStock",
      {
        ...basePayload(),
        title: "Out of Stock Items Report",
        titleAr: "تقرير الأصناف النفاذة",
        meta: [
          ...periodMeta(),
          { label: "Items / الأصناف", value: String(outOfStock.length) },
        ],
        sections: [
          {
            heading: "Zero Balance Items",
            headingAr: "أصناف رصيدها صفر",
            columns: [
              { en: "Product", ar: "المنتج", width: 0.34 },
              { en: "Unit", ar: "الوحدة", width: 0.13, align: "center" },
              { en: "Received", ar: "المستلم", width: 0.13, align: "center" },
              { en: "Sold", ar: "المباع", width: 0.13, align: "center" },
              { en: "Depleted On", ar: "تاريخ النفاذ", width: 0.27, align: "center" },
            ],
            rows: outOfStock.map((p) => [
              p.productName,
              p.unitType,
              String(p.receivedAll),
              String(p.soldAll),
              p.depletedAt ? pdfDate(p.depletedAt) : "-",
            ]),
            emptyText: "لا توجد أصناف رصيدها صفر",
          },
        ],
      },
      `cashier-out-of-stock-${range}-${stamp()}.pdf`
    );
  };

  const exportExpiringPdf = () => {
    const horizon = data?.expiryHorizonDays ?? 30;
    const value = filteredExpiring.reduce((s, e) => s + e.quantity * e.costPrice, 0);
    void runPdf(
      "expiring",
      {
        ...basePayload(),
        title: "Expired & Near-Expiry Report",
        titleAr: "تقرير منتهية الصلاحية وقريبة الانتهاء",
        meta: [
          ...periodMeta(),
          { label: "Look-ahead / نافذة التنبيه", value: `${horizon} days` },
        ],
        summaryCards: [
          {
            labelEn: "Expired",
            labelAr: "منتهية",
            value: String(filteredExpiring.filter((e) => e.expired).length),
          },
          {
            labelEn: "Near Expiry",
            labelAr: "قريبة الانتهاء",
            value: String(filteredExpiring.filter((e) => !e.expired).length),
          },
          { labelEn: "Value at Risk", labelAr: "القيمة المهددة", value: pdfMoney(value) },
        ],
        sections: [
          {
            heading: "Batches",
            headingAr: "الدفعات",
            columns: [
              { en: "Product", ar: "المنتج", width: 0.28 },
              { en: "Batch", ar: "الدفعة", width: 0.15 },
              { en: "Unit", ar: "الوحدة", width: 0.1, align: "center" },
              { en: "Qty", ar: "الكمية", width: 0.09, align: "center" },
              { en: "Expiry", ar: "الصلاحية", width: 0.14, align: "center" },
              { en: "Days", ar: "الأيام", width: 0.09, align: "center" },
              { en: "Status", ar: "الحالة", width: 0.15, align: "center" },
            ],
            rows: filteredExpiring.map((e) => [
              e.productName,
              e.batchNumber,
              e.unitType,
              String(e.quantity),
              pdfDate(e.expiryDate),
              String(e.daysLeft),
              e.expired ? "منتهي" : "قريب الانتهاء",
            ]),
            emptyText: "لا توجد أصناف منتهية أو قريبة الانتهاء",
          },
        ],
        notes: "القيمة محسوبة بسعر تكلفة الدفعة",
      },
      `cashier-expiry-${range}-${stamp()}.pdf`
    );
  };

  const cardProps = (key: DetailKey) => ({
    className: interactiveCardClass,
    role: "button" as const,
    tabIndex: 0,
    onClick: () => setDetail(key),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setDetail(key);
      }
    },
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

      {pdfError && !detail && (
        <p className="rounded-lg bg-danger/5 px-3 py-2 text-sm text-danger">
          {pdfError}
        </p>
      )}

      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            <Card {...cardProps("received")}>
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
                  <p className="mt-0.5 text-[11px] text-primary/80">
                    اضغط لعرض التفاصيل
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card {...cardProps("sold")}>
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
                  <p className="mt-0.5 text-[11px] text-primary/80">
                    اضغط لعرض التفاصيل
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card {...cardProps("remaining")}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-indigo-50 p-2">
                  <Boxes className="h-4 w-4 text-indigo-700" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">إجمالي المتبقي الحالي</p>
                  <p className="text-xl font-bold">
                    {data.summary.totalRemaining}
                  </p>
                  <p className="mt-0.5 text-[11px] text-primary/80">
                    اضغط لعرض التفاصيل
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle
                    className="cursor-pointer text-base hover:text-primary"
                    onClick={() => setDetail("remaining")}
                  >
                    المتبقي الحالي من كل منتج
                  </CardTitle>
                  <p className="text-xs text-slate-500">
                    المتبقي = إجمالي المستلم المؤكد − إجمالي المباع في نقطة البيع
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => exportDetailPdf("remaining")}
                  disabled={pdfBusy !== null}
                >
                  <FileDown className="h-4 w-4" />
                  {pdfBusy === "remaining" ? "جاري التصدير..." : "تصدير PDF"}
                </Button>
              </div>
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={alertTab === "outOfStock" ? "default" : "outline"}
                    onClick={() => setAlertTab("outOfStock")}
                  >
                    <PackageX className="h-4 w-4" />
                    الأصناف المنتهية / نفاذ المخزون ({outOfStock.length})
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={alertTab === "expiring" ? "default" : "outline"}
                    onClick={() => setAlertTab("expiring")}
                  >
                    <CalendarX className="h-4 w-4" />
                    منتهية الصلاحية / قريب الانتهاء ({expiring.length})
                  </Button>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={
                    alertTab === "outOfStock"
                      ? exportOutOfStockPdf
                      : exportExpiringPdf
                  }
                  disabled={pdfBusy !== null}
                >
                  <FileDown className="h-4 w-4" />
                  {pdfBusy === alertTab ? "جاري التصدير..." : "تصدير PDF"}
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                {alertTab === "outOfStock"
                  ? "أصناف رصيدها المتبقي صفر (المستلم المؤكد من الصيدلية − المباع في نقطة البيع)"
                  : `الدفعات المنتهية وما ينتهي خلال ${data.expiryHorizonDays ?? 30} يوماً`}
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {alertTab === "outOfStock" && (
                <>
                  {outOfStock.length === 0 && (
                    <p className="text-sm text-slate-500">
                      لا توجد أصناف رصيدها صفر
                    </p>
                  )}
                  {outOfStock.map((row) => (
                    <div
                      key={row.productId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">{row.productName}</p>
                        <p className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-500">
                          <Badge variant="outline">مستلم: {row.receivedAll}</Badge>
                          <Badge variant="outline">مباع: {row.soldAll}</Badge>
                          <Badge variant="outline">{row.unitType}</Badge>
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <Badge variant="danger">نفذ المخزون</Badge>
                        {row.depletedAt && (
                          <p className="mt-1 text-xs text-slate-500">
                            {formatDate(row.depletedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}

              {alertTab === "expiring" && (
                <>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["all", `الكل (${expiring.length})`],
                        ["expired", `منتهية (${expiredCount})`],
                        ["near", `قريبة الانتهاء (${expiring.length - expiredCount})`],
                      ] as const
                    ).map(([key, label]) => (
                      <Button
                        key={key}
                        type="button"
                        size="sm"
                        variant={expiryFilter === key ? "default" : "outline"}
                        onClick={() => setExpiryFilter(key)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  {filteredExpiring.length === 0 && (
                    <p className="text-sm text-slate-500">
                      لا توجد أصناف منتهية أو قريبة الانتهاء
                    </p>
                  )}
                  {filteredExpiring.map((row) => (
                    <div
                      key={row.batchId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">{row.productName}</p>
                        <p className="mt-1 flex flex-wrap gap-1.5 text-xs text-slate-500">
                          <Badge variant="outline">الدفعة: {row.batchNumber}</Badge>
                          <Badge variant="outline">الكمية: {row.quantity}</Badge>
                          <Badge variant="outline">{row.unitType}</Badge>
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <Badge variant={row.expired ? "danger" : "warning"}>
                          {row.expired
                            ? "منتهي"
                            : `متبقي ${row.daysLeft} يوم`}
                        </Badge>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDate(row.expiryDate)}
                        </p>
                      </div>
                    </div>
                  ))}
                </>
              )}
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

      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null);
            setPdfError(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              {detail ? `${DETAIL_META[detail].title} — ${rangeLabel(range)}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-right font-medium">المنتج</th>
                  <th className="px-3 py-2 text-right font-medium">الوحدة</th>
                  <th className="px-3 py-2 text-right font-medium">المستلم</th>
                  <th className="px-3 py-2 text-right font-medium">المباع</th>
                  <th className="px-3 py-2 text-right font-medium">المتبقي</th>
                </tr>
              </thead>
              <tbody>
                {detailRows.map((p) => (
                  <tr key={p.productId} className="border-t border-slate-100">
                    <td className="px-3 py-2">{p.productName}</td>
                    <td className="px-3 py-2 text-xs">{p.unitType}</td>
                    <td
                      className={cn(
                        "px-3 py-2",
                        detail === "received" && "font-semibold text-emerald-700"
                      )}
                    >
                      {p.receivedPeriod}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2",
                        detail === "sold" && "font-semibold text-amber-700"
                      )}
                    >
                      {p.soldPeriod}
                    </td>
                    <td className="px-3 py-2 font-semibold text-primary">
                      {p.remaining}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detailRows.length === 0 && (
              <p className="py-4 text-center text-sm text-slate-500">
                لا توجد بيانات في هذه الفترة
              </p>
            )}
          </div>
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <div className="rounded-lg bg-emerald-50 px-3 py-1.5">
                  <span className="text-slate-500">المستلم: </span>
                  <span className="font-bold">{detailTotals.received}</span>
                </div>
                <div className="rounded-lg bg-amber-50 px-3 py-1.5">
                  <span className="text-slate-500">المباع: </span>
                  <span className="font-bold">{detailTotals.sold}</span>
                </div>
                <div className="rounded-lg bg-indigo-50 px-3 py-1.5">
                  <span className="text-slate-500">المتبقي: </span>
                  <span className="font-bold text-primary">
                    {detailTotals.remaining}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => detail && exportDetailPdf(detail)}
                disabled={pdfBusy !== null || !detail}
              >
                <FileDown className="h-4 w-4" />
                {pdfBusy && pdfBusy === detail ? "جاري التصدير..." : "تصدير PDF"}
              </Button>
            </div>
            {pdfError && <p className="text-xs text-danger">{pdfError}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
