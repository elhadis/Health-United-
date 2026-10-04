"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Banknote,
  Smartphone,
  Printer,
  Trash2,
  FileDown,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { PrintBrandHeader } from "@/components/branding/print-brand-header";
import { FinanceTabs } from "@/components/reports/finance-tabs";
import { ShiftReportsTab } from "@/components/reports/shift-reports-tab";
import { useAuthStore, canDeleteRecords } from "@/lib/stores/auth-store";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { downloadTabularReportPdf } from "@/lib/pdf/official-pdf";

type RangeKey = "daily" | "weekly" | "monthly";

type Summary = {
  totalSales: number;
  totalProfit: number;
  salesCount: number;
  cashTotal: number;
  bankTotal: number;
  lowStockCount: number;
  nearExpiryCount: number;
  topSelling: Array<{
    name: string;
    category?: string;
    estimatedSold?: number;
    quantity?: number;
    revenue: number;
  }>;
  daily: Array<{ date: string; label: string; sales: number; profit: number }>;
  lowStock: Array<{
    id: string;
    batchId?: string;
    batchNumber?: string;
    name: string;
    availableQty: number;
    lowStockThreshold?: number;
    category?: string;
    expiryDate?: string;
    costPrice?: number;
    unitPrice?: number;
  }>;
  nearExpiry: Array<{
    id: string;
    batchId?: string;
    batchNumber?: string;
    name: string;
    availableQty: number;
    expiryDate: string;
    category?: string;
    costPrice?: number;
    unitPrice?: number;
  }>;
};

type SaleItemDetail = {
  productName: string;
  quantity: number;
  unitPrice: number | string;
  costPrice: number | string;
  lineTotal: number | string;
  lineProfit: number | string;
  product?: { category?: string | null } | null;
};

type CategoryFilter = "ALL" | "HUMAN" | "VETERINARY";

const CATEGORY_FILTER_LABELS: Record<CategoryFilter, { ar: string; en: string }> = {
  ALL: { ar: "الكل", en: "All" },
  HUMAN: { ar: "بشري", en: "Human" },
  VETERINARY: { ar: "بيطري", en: "Veterinary" },
};

type SaleDetail = {
  id: string;
  receiptNumber: string;
  total: number | string;
  profit: number | string;
  totalCost?: number | string;
  paymentMethod: string;
  bankAppName?: string | null;
  createdAt: string;
  cashier?: { name: string; username: string } | null;
  items?: SaleItemDetail[];
};

type DrillModal =
  | "sales"
  | "profit"
  | "invoices"
  | "alerts"
  | "cash"
  | "bank"
  | null;

function getRangeBounds(range: RangeKey) {
  const to = new Date();
  const from = new Date(to);
  if (range === "daily") from.setHours(0, 0, 0, 0);
  else if (range === "weekly") from.setDate(from.getDate() - 7);
  else from.setMonth(from.getMonth() - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function rangeLabel(range: RangeKey) {
  if (range === "daily") return "اليومي";
  if (range === "weekly") return "الأسبوعي";
  return "الشهري";
}

const RANGE_LABELS_EN: Record<RangeKey, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const pdfMoney = (n: number) =>
  `${Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} SDG`;

const pdfDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB");

const pdfDateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function pdfPaymentLabel(sale: SaleDetail) {
  if (sale.paymentMethod === "BANK_APP") {
    return sale.bankAppName?.trim() ? `Bank · ${sale.bankAppName.trim()}` : "Bank App";
  }
  return "Cash";
}

function paymentLabel(sale: SaleDetail) {
  if (sale.paymentMethod === "BANK_APP") {
    return sale.bankAppName?.trim()
      ? `بنكي · ${sale.bankAppName}`
      : "تطبيق بنكي";
  }
  return "نقدي";
}

async function fetchAnalytics(range: string) {
  const res = await fetch(`/api/analytics?range=${range}`);
  const data = await res.json();
  return data.summary as Summary;
}

async function fetchSalesDetail(range: RangeKey) {
  const { from, to } = getRangeBounds(range);
  const res = await fetch(
    `/api/sales?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  );
  const data = await res.json();
  return (data.sales ?? []) as SaleDetail[];
}

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isSuperAdmin = user?.role === "ADMINISTRATOR";
  const allowDelete = canDeleteRecords(user?.role);
  const [range, setRange] = useState<RangeKey>("weekly");
  const [section, setSection] = useState<"analytics" | "finance" | "shifts">(
    "analytics"
  );
  const [drillModal, setDrillModal] = useState<DrillModal>(null);
  const [deleteSaleId, setDeleteSaleId] = useState<string | null>(null);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);

  const { data: summary, isLoading } = useQuery({
    queryKey: ["analytics", range],
    queryFn: () => fetchAnalytics(range),
    refetchOnMount: "always",
    staleTime: 0,
  });

  const { data: sales = [], isFetching: loadingSales } = useQuery({
    queryKey: ["sales-detail", range],
    queryFn: () => fetchSalesDetail(range),
    enabled: isSuperAdmin,
  });

  const cashSales = useMemo(
    () => sales.filter((s) => s.paymentMethod === "CASH"),
    [sales]
  );
  const bankSales = useMemo(
    () => sales.filter((s) => s.paymentMethod === "BANK_APP"),
    [sales]
  );

  const [drillCategory, setDrillCategory] = useState<CategoryFilter>("ALL");

  /** Sales narrowed to items of the selected category, with totals recomputed from those lines. */
  const modalSales = useMemo(() => {
    if (drillCategory === "ALL") return sales;
    const result: SaleDetail[] = [];
    for (const sale of sales) {
      const items = (sale.items ?? []).filter(
        (item) => item.product?.category === drillCategory
      );
      if (items.length === 0) continue;
      result.push({
        ...sale,
        items,
        total: items.reduce((s, i) => s + Number(i.lineTotal || 0), 0),
        profit: items.reduce((s, i) => s + Number(i.lineProfit || 0), 0),
      });
    }
    return result;
  }, [sales, drillCategory]);

  const alertLow = useMemo(
    () =>
      (summary?.lowStock ?? []).filter(
        (p) => drillCategory === "ALL" || p.category === drillCategory
      ),
    [summary, drillCategory]
  );
  const alertExpiry = useMemo(
    () =>
      (summary?.nearExpiry ?? []).filter(
        (p) => drillCategory === "ALL" || p.category === drillCategory
      ),
    [summary, drillCategory]
  );

  const profitRows = useMemo(() => {
    const rows: Array<{
      receiptNumber: string;
      productName: string;
      quantity: number;
      costPrice: number;
      unitPrice: number;
      lineProfit: number;
      createdAt: string;
    }> = [];
    for (const sale of modalSales) {
      for (const item of sale.items ?? []) {
        rows.push({
          receiptNumber: sale.receiptNumber,
          productName: item.productName,
          quantity: item.quantity,
          costPrice: Number(item.costPrice),
          unitPrice: Number(item.unitPrice),
          lineProfit: Number(item.lineProfit),
          createdAt: sale.createdAt,
        });
      }
    }
    return rows;
  }, [modalSales]);

  const salesTotals = useMemo(
    () => ({
      amount: modalSales.reduce((s, x) => s + Number(x.total || 0), 0),
      count: modalSales.length,
    }),
    [modalSales]
  );

  const profitTotals = useMemo(() => {
    let revenue = 0;
    let cost = 0;
    let profit = 0;
    for (const r of profitRows) {
      revenue += r.unitPrice * r.quantity;
      cost += r.costPrice * r.quantity;
      profit += r.lineProfit;
    }
    return { revenue, cost, profit, lines: profitRows.length };
  }, [profitRows]);

  const alertTotals = useMemo(() => {
    const low = alertLow;
    const exp = alertExpiry;
    const now = Date.now();
    const valueOf = (p: { availableQty: number; costPrice?: number }) =>
      Number(p.availableQty || 0) * Number(p.costPrice || 0);
    const unique = new Set<string>();
    for (const p of low) unique.add(p.batchId ?? `${p.id}-${p.name}`);
    for (const p of exp) unique.add(p.batchId ?? `${p.id}-${p.expiryDate}`);
    return {
      lowCount: low.length,
      expiryCount: exp.length,
      expiredCount: exp.filter((p) => new Date(p.expiryDate).getTime() < now).length,
      totalItems: unique.size,
      lowValue: low.reduce((s, p) => s + valueOf(p), 0),
      expiryValue: exp.reduce((s, p) => s + valueOf(p), 0),
    };
  }, [alertLow, alertExpiry]);

  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const exportDrillPdf = async () => {
    if (
      drillModal !== "sales" &&
      drillModal !== "profit" &&
      drillModal !== "invoices" &&
      drillModal !== "alerts"
    ) {
      return;
    }
    setPdfBusy(true);
    setPdfError(null);
    try {
      const { from, to } = getRangeBounds(range);
      const categoryMeta = {
        label: "Category / التصنيف",
        value: `${CATEGORY_FILTER_LABELS[drillCategory].en} · ${CATEGORY_FILTER_LABELS[drillCategory].ar}`,
      };
      const periodMeta = [
        {
          label: "Period / الفترة",
          value: `${RANGE_LABELS_EN[range]} · ${rangeLabel(range)}`,
        },
        { label: "Range / النطاق", value: `${pdfDate(from)} - ${pdfDate(to)}` },
        categoryMeta,
      ];
      const base = {
        reference: `RPT-${Date.now().toString(36).toUpperCase()}`,
        date: pdfDateTime(new Date().toISOString()),
      };
      const stamp = new Date().toISOString().slice(0, 10);
      const catSuffix = drillCategory === "ALL" ? "" : `-${drillCategory.toLowerCase()}`;

      if (drillModal === "invoices") {
        await downloadTabularReportPdf(
          {
            ...base,
            title: "Invoices Register",
            titleAr: "سجل الفواتير",
            meta: periodMeta,
            summaryCards: [
              { labelEn: "Invoices", labelAr: "إجمالي الفواتير", value: String(salesTotals.count) },
              { labelEn: "Total Amount", labelAr: "إجمالي المبلغ", value: pdfMoney(salesTotals.amount) },
              {
                labelEn: "Net Profit",
                labelAr: "صافي الربح",
                value: pdfMoney(modalSales.reduce((s, x) => s + Number(x.profit || 0), 0)),
              },
            ],
            sections: [
              {
                columns: [
                  { en: "Invoice No", ar: "رقم الفاتورة", width: 0.2 },
                  { en: "Date", ar: "التاريخ", width: 0.2, align: "center" },
                  { en: "Cashier", ar: "الكاشير", width: 0.22 },
                  { en: "Payment", ar: "الدفع", width: 0.18, align: "center" },
                  { en: "Total", ar: "الإجمالي", width: 0.2, align: "right" },
                ],
                rows: modalSales.map((sale) => [
                  sale.receiptNumber,
                  pdfDateTime(sale.createdAt),
                  sale.cashier?.name ?? "-",
                  pdfPaymentLabel(sale),
                  pdfMoney(Number(sale.total)),
                ]),
                emptyText: "لا توجد فواتير في هذه الفترة",
              },
            ],
          },
          `invoices-${range}${catSuffix}-${stamp}.pdf`
        );
      } else if (drillModal === "sales") {
        await downloadTabularReportPdf(
          {
            ...base,
            title: "Sales Details Report",
            titleAr: "تقرير تفاصيل المبيعات",
            meta: periodMeta,
            summaryCards: [
              { labelEn: "Total Sales", labelAr: "إجمالي المبيعات", value: pdfMoney(salesTotals.amount) },
              { labelEn: "Receipts", labelAr: "عدد الفواتير", value: String(salesTotals.count) },
              {
                labelEn: "Average Receipt",
                labelAr: "متوسط الفاتورة",
                value: pdfMoney(salesTotals.count ? salesTotals.amount / salesTotals.count : 0),
              },
            ],
            sections: [
              {
                heading: "Sales Receipts",
                headingAr: "فواتير المبيعات",
                columns: [
                  { en: "Receipt", ar: "رقم الإيصال", width: 0.2 },
                  { en: "Date", ar: "التاريخ", width: 0.2, align: "center" },
                  { en: "Cashier", ar: "الكاشير", width: 0.18 },
                  { en: "Payment", ar: "الدفع", width: 0.16, align: "center" },
                  { en: "Units", ar: "الوحدات", width: 0.1, align: "center" },
                  { en: "Total", ar: "الإجمالي", width: 0.16, align: "right" },
                ],
                rows: modalSales.map((sale) => [
                  sale.receiptNumber,
                  pdfDateTime(sale.createdAt),
                  sale.cashier?.name ?? "-",
                  pdfPaymentLabel(sale),
                  String((sale.items ?? []).reduce((s, i) => s + Number(i.quantity || 0), 0)),
                  pdfMoney(Number(sale.total)),
                ]),
                emptyText: "لا توجد مبيعات في هذه الفترة",
              },
            ],
          },
          `sales-details-${range}${catSuffix}-${stamp}.pdf`
        );
      } else if (drillModal === "profit") {
        await downloadTabularReportPdf(
          {
            ...base,
            title: "Net Profit Details Report",
            titleAr: "تقرير تفاصيل صافي الربح",
            meta: [...periodMeta, { label: "Receipts / الفواتير", value: String(modalSales.length) }],
            summaryCards: [
              { labelEn: "Revenue", labelAr: "إجمالي البيع", value: pdfMoney(profitTotals.revenue) },
              { labelEn: "Cost", labelAr: "إجمالي التكلفة", value: pdfMoney(profitTotals.cost) },
              { labelEn: "Net Profit", labelAr: "صافي الربح", value: pdfMoney(profitTotals.profit) },
            ],
            sections: [
              {
                heading: "Profit Breakdown",
                headingAr: "تفصيل الأرباح",
                columns: [
                  { en: "Receipt", ar: "الإيصال", width: 0.17 },
                  { en: "Product", ar: "المنتج", width: 0.27 },
                  { en: "Qty", ar: "الكمية", width: 0.08, align: "center" },
                  { en: "Cost", ar: "التكلفة", width: 0.16, align: "right" },
                  { en: "Price", ar: "البيع", width: 0.16, align: "right" },
                  { en: "Profit", ar: "الربح", width: 0.16, align: "right" },
                ],
                rows: profitRows.map((r) => [
                  r.receiptNumber,
                  r.productName,
                  String(r.quantity),
                  pdfMoney(r.costPrice),
                  pdfMoney(r.unitPrice),
                  pdfMoney(r.lineProfit),
                ]),
                emptyText: "لا توجد بنود ربح في هذه الفترة",
              },
            ],
          },
          `net-profit-${range}${catSuffix}-${stamp}.pdf`
        );
      } else if (summary) {
        const now = Date.now();
        await downloadTabularReportPdf(
          {
            ...base,
            title: "Stock Alerts Report",
            titleAr: "تقرير تنبيهات المخزون والصلاحية",
            meta: [
              categoryMeta,
              { label: "Low Stock / كمية منخفضة", value: String(alertTotals.lowCount) },
              { label: "Near Expiry / قرب الانتهاء", value: String(alertTotals.expiryCount) },
              { label: "Expired / منتهية", value: String(alertTotals.expiredCount) },
            ],
            summaryCards: [
              { labelEn: "Alert Items", labelAr: "إجمالي الأصناف المنبهة", value: String(alertTotals.totalItems) },
              { labelEn: "Low Stock Value", labelAr: "قيمة المنخفض", value: pdfMoney(alertTotals.lowValue) },
              { labelEn: "Expiry Risk Value", labelAr: "قيمة مهددة بالانتهاء", value: pdfMoney(alertTotals.expiryValue) },
            ],
            sections: [
              {
                heading: `Low Stock (${alertTotals.lowCount})`,
                headingAr: "كمية منخفضة",
                columns: [
                  { en: "Product", ar: "المنتج", width: 0.32 },
                  { en: "Batch", ar: "الدفعة", width: 0.18 },
                  { en: "Qty", ar: "الكمية", width: 0.1, align: "center" },
                  { en: "Threshold", ar: "الحد", width: 0.12, align: "center" },
                  { en: "Stock Value", ar: "القيمة", width: 0.28, align: "right" },
                ],
                rows: alertLow.map((p) => [
                  p.name,
                  p.batchNumber ?? "-",
                  String(p.availableQty),
                  String(p.lowStockThreshold ?? 10),
                  pdfMoney(Number(p.availableQty || 0) * Number(p.costPrice || 0)),
                ]),
                emptyText: "لا توجد عناصر منخفضة المخزون",
              },
              {
                heading: `Expired / Near Expiry (${alertTotals.expiryCount})`,
                headingAr: "منتهية / قريبة الانتهاء",
                columns: [
                  { en: "Product", ar: "المنتج", width: 0.28 },
                  { en: "Batch", ar: "الدفعة", width: 0.16 },
                  { en: "Qty", ar: "الكمية", width: 0.1, align: "center" },
                  { en: "Expiry", ar: "الصلاحية", width: 0.14, align: "center" },
                  { en: "Status", ar: "الحالة", width: 0.14, align: "center" },
                  { en: "Value at Risk", ar: "القيمة", width: 0.18, align: "right" },
                ],
                rows: alertExpiry.map((p) => [
                  p.name,
                  p.batchNumber ?? "-",
                  String(p.availableQty),
                  pdfDate(p.expiryDate),
                  new Date(p.expiryDate).getTime() < now ? "منتهي" : "قريب الانتهاء",
                  pdfMoney(Number(p.availableQty || 0) * Number(p.costPrice || 0)),
                ]),
                emptyText: "لا توجد عناصر قريبة من انتهاء الصلاحية",
              },
            ],
            notes: "القيم محسوبة بسعر تكلفة الدفعة",
          },
          `stock-alerts${catSuffix}-${stamp}.pdf`
        );
      }
    } catch (err) {
      console.error("[reports pdf]", err);
      setPdfError("تعذر إنشاء ملف PDF، حاول مرة أخرى");
    } finally {
      setPdfBusy(false);
    }
  };

  const hasDrillFooter =
    drillModal === "sales" ||
    drillModal === "profit" ||
    drillModal === "invoices" ||
    drillModal === "alerts";

  const confirmDeleteSale = async () => {
    if (!deleteSaleId) return;
    const res = await fetch(
      `/api/sales?id=${encodeURIComponent(deleteSaleId)}`,
      { method: "DELETE" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setDeleteMsg(data.error || "فشل حذف سجل البيع");
      return;
    }
    setDeleteMsg("تم حذف سجل البيع بنجاح");
    setDeleteSaleId(null);
    void queryClient.invalidateQueries({ queryKey: ["sales-detail"] });
    void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const openDrill = (modal: Exclude<DrillModal, null>) => {
    if (!isSuperAdmin) return;
    setDrillModal(modal);
  };

  const interactiveCardClass = isSuperAdmin
    ? "cursor-pointer transition-all hover:shadow-md hover:ring-2 hover:ring-primary/25 active:scale-[0.99]"
    : "";

  return (
    <AppShell
      title="التقارير والأرباح"
      subtitle="مبيعات، هامش الربح الفعلي، تنبيهات المخزون والصلاحية"
      actions={
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {(
            [
              ["daily", "يومي"],
              ["weekly", "أسبوعي"],
              ["monthly", "شهري"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={range === key ? "default" : "outline"}
              className={
                range === key
                  ? ""
                  : "border-white/20 bg-white/5 text-white hover:bg-white/10"
              }
              onClick={() => setRange(key)}
            >
              {label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="border-white/20 bg-white/5 text-white hover:bg-white/10"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" />
            <span className="hidden xs:inline sm:inline">طباعة</span>
          </Button>
        </div>
      }
    >
      {isSuperAdmin && (
        <div className="mb-4 flex flex-wrap gap-2 no-print">
          <Button
            type="button"
            size="sm"
            variant={section === "analytics" ? "default" : "outline"}
            onClick={() => setSection("analytics")}
          >
            لوحة التحليلات
          </Button>
          <Button
            type="button"
            size="sm"
            variant={section === "finance" ? "default" : "outline"}
            onClick={() => setSection("finance")}
          >
            المدفوعات والفواتير
          </Button>
          <Button
            type="button"
            size="sm"
            variant={section === "shifts" ? "default" : "outline"}
            onClick={() => setSection("shifts")}
          >
            تقارير الورديات
          </Button>
        </div>
      )}

      {isSuperAdmin && section === "finance" && <FinanceTabs />}
      {isSuperAdmin && section === "shifts" && <ShiftReportsTab />}

      {section === "analytics" && (isLoading || !summary) ? (
        <p className="text-sm text-slate-500">جاري تحميل التقارير...</p>
      ) : section === "analytics" && summary ? (
        <div className="print-document space-y-6">
          <PrintBrandHeader
            documentTitle={
              range === "daily"
                ? "تقرير المبيعات اليومي"
                : range === "weekly"
                  ? "تقرير المبيعات الأسبوعي"
                  : "تقرير المبيعات الشهري"
            }
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {(
              [
                {
                  key: "sales" as const,
                  label: "إجمالي المبيعات",
                  value: formatCurrency(summary.totalSales),
                  icon: DollarSign,
                  color: "text-primary bg-primary/10",
                },
                {
                  key: "profit" as const,
                  label: "صافي الربح",
                  value: formatCurrency(summary.totalProfit),
                  icon: TrendingUp,
                  color: "text-success bg-success/10",
                },
                {
                  key: "invoices" as const,
                  label: "عدد الفواتير",
                  value: String(summary.salesCount),
                  icon: BarChart3,
                  color: "text-banking bg-banking/10",
                },
                {
                  key: "alerts" as const,
                  label: "تنبيهات",
                  value: `${summary.lowStockCount} منخفض / ${summary.nearExpiryCount} صلاحية`,
                  icon: AlertTriangle,
                  color: "text-warning bg-warning/10",
                },
              ] as const
            ).map((card, i) => (
              <motion.div
                key={card.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card
                  className={cn(interactiveCardClass, "no-print-hover")}
                  role={isSuperAdmin ? "button" : undefined}
                  tabIndex={isSuperAdmin ? 0 : undefined}
                  onClick={() => openDrill(card.key)}
                  onKeyDown={(e) => {
                    if (
                      isSuperAdmin &&
                      (e.key === "Enter" || e.key === " ")
                    ) {
                      e.preventDefault();
                      openDrill(card.key);
                    }
                  }}
                >
                  <CardContent className="flex items-center gap-3 p-5">
                    <div className={`rounded-xl p-3 ${card.color}`}>
                      <card.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500">{card.label}</p>
                      <p className="text-lg font-bold leading-tight">
                        {card.value}
                      </p>
                      {isSuperAdmin && (
                        <p className="mt-1 text-[11px] text-primary/80">
                          اضغط لعرض التفاصيل
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  المبيعات والأرباح
                </CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={summary.daily}>
                    <defs>
                      <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0D9488" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#0D9488" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value ?? 0))}
                      contentStyle={{ direction: "rtl", borderRadius: 12 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="sales"
                      name="المبيعات"
                      stroke="#0D9488"
                      fill="url(#salesFill)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="profit"
                      name="الربح"
                      stroke="#10B981"
                      fill="transparent"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>طرق الدفع</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className={cn(
                    "flex items-center justify-between rounded-xl bg-slate-50 p-4",
                    isSuperAdmin &&
                      "cursor-pointer transition-all hover:ring-2 hover:ring-primary/25 hover:shadow-sm"
                  )}
                  role={isSuperAdmin ? "button" : undefined}
                  tabIndex={isSuperAdmin ? 0 : undefined}
                  onClick={() => openDrill("cash")}
                  onKeyDown={(e) => {
                    if (isSuperAdmin && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      openDrill("cash");
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-primary" />
                    <span>نقدي</span>
                  </div>
                  <span className="font-bold">
                    {formatCurrency(summary.cashTotal)}
                  </span>
                </div>
                <div
                  className={cn(
                    "flex items-center justify-between rounded-xl bg-indigo-50 p-4",
                    isSuperAdmin &&
                      "cursor-pointer transition-all hover:ring-2 hover:ring-banking/30 hover:shadow-sm"
                  )}
                  role={isSuperAdmin ? "button" : undefined}
                  tabIndex={isSuperAdmin ? 0 : undefined}
                  onClick={() => openDrill("bank")}
                  onKeyDown={(e) => {
                    if (isSuperAdmin && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      openDrill("bank");
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-banking" />
                    <span>تطبيقات بنكية</span>
                  </div>
                  <span className="font-bold text-banking">
                    {formatCurrency(summary.bankTotal)}
                  </span>
                </div>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        { name: "نقدي", value: summary.cashTotal },
                        { name: "بنكي", value: summary.bankTotal },
                      ]}
                    >
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(v) => formatCurrency(Number(v ?? 0))}
                      />
                      <Bar
                        dataKey="value"
                        fill="#0D9488"
                        radius={[8, 8, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  الأكثر مبيعاً
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {summary.topSelling.map((item, i) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-slate-500">
                          الكمية: {item.quantity ?? item.estimatedSold ?? 0}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-primary">
                      {formatCurrency(item.revenue)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  تنبيهات المخزون والصلاحية
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {summary.lowStock.slice(0, 4).map((p) => (
                  <div
                    key={`low-${p.batchId ?? p.id}-${p.name}`}
                    className="flex items-center justify-between rounded-lg bg-warning/5 px-3 py-2"
                  >
                    <span className="text-sm">{p.name}</span>
                    <Badge variant="warning">متبقي {p.availableQty}</Badge>
                  </div>
                ))}
                {summary.nearExpiry.slice(0, 4).map((p) => (
                  <div
                    key={`exp-${p.batchId ?? p.id}-${p.expiryDate}`}
                    className="flex items-center justify-between rounded-lg bg-danger/5 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm">{p.name}</p>
                      <p className="text-xs text-slate-500">
                        {formatDate(p.expiryDate)}
                      </p>
                    </div>
                    <Badge variant="danger">صلاحية</Badge>
                  </div>
                ))}
                {!summary.lowStock.length && !summary.nearExpiry.length && (
                  <p className="text-sm text-slate-500">
                    لا توجد تنبيهات حالياً
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {allowDelete && (
            <Card className="no-print">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trash2 className="h-5 w-5 text-danger" />
                  سجلات المبيعات (حذف للمدير العام فقط)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {deleteMsg && (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    {deleteMsg}
                  </p>
                )}
                {sales.length === 0 && (
                  <p className="text-sm text-slate-500">لا توجد سجلات مبيعات</p>
                )}
                {sales.slice(0, 20).map((sale) => (
                  <div
                    key={sale.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{sale.receiptNumber}</p>
                      <p className="text-xs text-slate-500">
                        {formatDate(sale.createdAt)} · {paymentLabel(sale)} ·{" "}
                        {formatCurrency(Number(sale.total))}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={() => setDeleteSaleId(sale.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      حذف
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      {/* Drill-down modals — ADMINISTRATOR only */}
      <Dialog
        open={isSuperAdmin && drillModal !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDrillModal(null);
            setPdfError(null);
            setDrillCategory("ALL");
          }
        }}
      >
                <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>
              {drillModal === "sales" && `تفاصيل المبيعات — ${rangeLabel(range)}`}
              {drillModal === "profit" && `تفصيل الأرباح — ${rangeLabel(range)}`}
              {drillModal === "invoices" &&
                `سجل الفواتير — ${rangeLabel(range)}`}
              {drillModal === "alerts" && "تنبيهات المخزون والصلاحية"}
              {drillModal === "cash" && `المبيعات النقدية — ${rangeLabel(range)}`}
              {drillModal === "bank" &&
                `مبيعات التطبيقات البنكية — ${rangeLabel(range)}`}
            </DialogTitle>
          </DialogHeader>

          {hasDrillFooter && (
            <div className="flex flex-wrap gap-2">
              {(["ALL", "HUMAN", "VETERINARY"] as const).map((c) => (
                <Button
                  key={c}
                  type="button"
                  size="sm"
                  variant={drillCategory === c ? "default" : "outline"}
                  onClick={() => setDrillCategory(c)}
                >
                  {CATEGORY_FILTER_LABELS[c].ar}
                </Button>
              ))}
            </div>
          )}

          <div
            className={cn(
              "overflow-y-auto",
              hasDrillFooter ? "max-h-[50vh]" : "max-h-[65vh]"
            )}
          >
            {loadingSales &&
              drillModal !== "alerts" &&
              drillModal !== null && (
                <p className="py-6 text-center text-sm text-slate-500">
                  جاري تحميل التفاصيل...
                </p>
              )}

            {drillModal === "sales" && !loadingSales && (
              <div className="space-y-3">
                {modalSales.length === 0 && (
                  <p className="text-sm text-slate-500">
                    لا توجد مبيعات في هذه الفترة
                  </p>
                )}
                {modalSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="rounded-xl border border-slate-100 p-3"
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-secondary">
                          {sale.receiptNumber}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(sale.createdAt).toLocaleString("ar-SD")}
                        </p>
                      </div>
                      <div className="text-left">
                        <Badge variant="outline">{paymentLabel(sale)}</Badge>
                        <p className="mt-1 font-bold text-primary">
                          {formatCurrency(Number(sale.total))}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(sale.items ?? []).map((item, idx) => (
                        <Badge key={idx} variant="secondary">
                          {item.productName} × {item.quantity}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {drillModal === "profit" && !loadingSales && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-right font-medium">الإيصال</th>
                      <th className="px-3 py-2 text-right font-medium">المنتج</th>
                      <th className="px-3 py-2 text-right font-medium">الكمية</th>
                      <th className="px-3 py-2 text-right font-medium">التكلفة</th>
                      <th className="px-3 py-2 text-right font-medium">البيع</th>
                      <th className="px-3 py-2 text-right font-medium">الربح</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitRows.map((row, idx) => (
                      <tr key={idx} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-mono text-xs">
                          {row.receiptNumber}
                        </td>
                        <td className="px-3 py-2">{row.productName}</td>
                        <td className="px-3 py-2">{row.quantity}</td>
                        <td className="px-3 py-2">
                          {formatCurrency(row.costPrice)}
                        </td>
                        <td className="px-3 py-2">
                          {formatCurrency(row.unitPrice)}
                        </td>
                        <td className="px-3 py-2 font-semibold text-success">
                          {formatCurrency(row.lineProfit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {profitRows.length === 0 && (
                  <p className="py-4 text-sm text-slate-500">
                    لا توجد بنود ربح في هذه الفترة
                  </p>
                )}
              </div>
            )}

            {drillModal === "invoices" && !loadingSales && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-right font-medium">رقم الفاتورة</th>
                      <th className="px-3 py-2 text-right font-medium">التاريخ</th>
                      <th className="px-3 py-2 text-right font-medium">الكاشير</th>
                      <th className="px-3 py-2 text-right font-medium">الدفع</th>
                      <th className="px-3 py-2 text-right font-medium">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalSales.map((sale) => (
                      <tr key={sale.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium">
                          {sale.receiptNumber}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">
                          {new Date(sale.createdAt).toLocaleString("ar-SD")}
                        </td>
                        <td className="px-3 py-2">
                          {sale.cashier?.name ?? "—"}
                          {sale.cashier?.username
                            ? ` (@${sale.cashier.username})`
                            : ""}
                        </td>
                        <td className="px-3 py-2">{paymentLabel(sale)}</td>
                        <td className="px-3 py-2 font-semibold">
                          {formatCurrency(Number(sale.total))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {modalSales.length === 0 && (
                  <p className="py-4 text-sm text-slate-500">
                    لا توجد فواتير في هذه الفترة
                  </p>
                )}
              </div>
            )}

            {drillModal === "alerts" && summary && (
              <div className="space-y-5">
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-warning">
                    كمية منخفضة
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead className="bg-warning/5 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-right font-medium">المنتج</th>
                          <th className="px-3 py-2 text-right font-medium">الدفعة</th>
                          <th className="px-3 py-2 text-right font-medium">الكمية</th>
                          <th className="px-3 py-2 text-right font-medium">الحد</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alertLow.map((p) => (
                          <tr
                            key={`alert-low-${p.batchId ?? p.id}-${p.name}`}
                            className="border-t border-slate-100"
                          >
                            <td className="px-3 py-2">{p.name}</td>
                            <td className="px-3 py-2 font-mono text-xs">
                              {p.batchNumber ?? "—"}
                            </td>
                            <td className="px-3 py-2 font-semibold text-danger">
                              {p.availableQty}
                            </td>
                            <td className="px-3 py-2">
                              {p.lowStockThreshold ?? 10}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!alertLow.length && (
                      <p className="py-2 text-sm text-slate-500">
                        لا توجد عناصر منخفضة المخزون
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-danger">
                    قرب انتهاء الصلاحية
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead className="bg-danger/5 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-right font-medium">المنتج</th>
                          <th className="px-3 py-2 text-right font-medium">الدفعة</th>
                          <th className="px-3 py-2 text-right font-medium">الكمية</th>
                          <th className="px-3 py-2 text-right font-medium">الصلاحية</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alertExpiry.map((p) => (
                          <tr
                            key={`alert-exp-${p.batchId ?? p.id}-${p.expiryDate}`}
                            className="border-t border-slate-100"
                          >
                            <td className="px-3 py-2">{p.name}</td>
                            <td className="px-3 py-2 font-mono text-xs">
                              {p.batchNumber ?? "—"}
                            </td>
                            <td className="px-3 py-2">{p.availableQty}</td>
                            <td className="px-3 py-2">
                              {formatDate(p.expiryDate)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!alertExpiry.length && (
                      <p className="py-2 text-sm text-slate-500">
                        لا توجد عناصر قريبة من انتهاء الصلاحية
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {drillModal === "cash" && !loadingSales && (
              <div className="space-y-3">
                {cashSales.length === 0 && (
                  <p className="text-sm text-slate-500">
                    لا توجد مبيعات نقدية في هذه الفترة
                  </p>
                )}
                {cashSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2"
                  >
                    <div>
                      <p className="font-medium">{sale.receiptNumber}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(sale.createdAt).toLocaleString("ar-SD")} ·{" "}
                        {sale.cashier?.name ?? "—"}
                      </p>
                    </div>
                    <span className="font-bold">
                      {formatCurrency(Number(sale.total))}
                    </span>
                  </div>
                ))}
                {cashSales.length > 0 && (
                  <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold">
                    <span>إجمالي النقدي</span>
                    <span>
                      {formatCurrency(
                        cashSales.reduce((s, x) => s + Number(x.total), 0)
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}

            {drillModal === "bank" && !loadingSales && (
              <div className="space-y-3">
                {bankSales.length === 0 && (
                  <p className="text-sm text-slate-500">
                    لا توجد مبيعات بنكية في هذه الفترة
                  </p>
                )}
                {bankSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50/40 px-3 py-2"
                  >
                    <div>
                      <p className="font-medium">{sale.receiptNumber}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(sale.createdAt).toLocaleString("ar-SD")} ·{" "}
                        {sale.bankAppName?.trim() || "تطبيق بنكي"} ·{" "}
                        {sale.cashier?.name ?? "—"}
                      </p>
                    </div>
                    <span className="font-bold text-banking">
                      {formatCurrency(Number(sale.total))}
                    </span>
                  </div>
                ))}
                {bankSales.length > 0 && (
                  <div className="flex justify-between rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-banking">
                    <span>إجمالي البنكي</span>
                    <span>
                      {formatCurrency(
                        bankSales.reduce((s, x) => s + Number(x.total), 0)
                      )}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {hasDrillFooter && (
            <div className="sticky bottom-0 mt-3 space-y-2 border-t border-slate-100 bg-white pt-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2 text-sm">
                  {drillModal === "invoices" && (
                    <>
                      <div className="rounded-lg bg-slate-50 px-3 py-1.5">
                        <span className="text-slate-500">إجمالي الفواتير: </span>
                        <span className="font-bold">{salesTotals.count}</span>
                      </div>
                      <div className="rounded-lg bg-primary/5 px-3 py-1.5">
                        <span className="text-slate-500">إجمالي المبلغ: </span>
                        <span className="font-bold text-primary">
                          {formatCurrency(salesTotals.amount)}
                        </span>
                      </div>
                    </>
                  )}
                  {drillModal === "sales" && (
                    <>
                      <div className="rounded-lg bg-primary/5 px-3 py-1.5">
                        <span className="text-slate-500">
                          إجمالي المبيعات للمدة المحددة:{" "}
                        </span>
                        <span className="font-bold text-primary">
                          {formatCurrency(salesTotals.amount)}
                        </span>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-1.5">
                        <span className="text-slate-500">إجمالي عدد الفواتير: </span>
                        <span className="font-bold">{salesTotals.count}</span>
                      </div>
                    </>
                  )}
                  {drillModal === "profit" && (
                    <>
                      <div className="rounded-lg bg-success/5 px-3 py-1.5">
                        <span className="text-slate-500">
                          إجمالي صافي الربح للمدة المحددة:{" "}
                        </span>
                        <span className="font-bold text-success">
                          {formatCurrency(profitTotals.profit)}
                        </span>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-1.5">
                        <span className="text-slate-500">إجمالي البيع: </span>
                        <span className="font-semibold">
                          {formatCurrency(profitTotals.revenue)}
                        </span>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-1.5">
                        <span className="text-slate-500">إجمالي التكلفة: </span>
                        <span className="font-semibold">
                          {formatCurrency(profitTotals.cost)}
                        </span>
                      </div>
                    </>
                  )}
                  {drillModal === "alerts" && (
                    <>
                      <div className="rounded-lg bg-warning/5 px-3 py-1.5">
                        <span className="text-slate-500">إجمالي الأصناف المنبهة: </span>
                        <span className="font-bold text-warning">
                          {alertTotals.totalItems}
                        </span>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-1.5">
                        <span className="text-slate-500">قيمة المنخفض: </span>
                        <span className="font-semibold">
                          {formatCurrency(alertTotals.lowValue)}
                        </span>
                      </div>
                      <div className="rounded-lg bg-danger/5 px-3 py-1.5">
                        <span className="text-slate-500">قيمة مهددة بالانتهاء: </span>
                        <span className="font-semibold text-danger">
                          {formatCurrency(alertTotals.expiryValue)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void exportDrillPdf()}
                  disabled={
                    pdfBusy || (drillModal !== "alerts" && loadingSales)
                  }
                >
                  <FileDown className="h-4 w-4" />
                  {pdfBusy ? "جاري التحميل..." : "تحميل PDF"}
                </Button>
              </div>
              {pdfError && (
                <p className="text-xs text-danger">{pdfError}</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteSaleId}
        onOpenChange={(open) => {
          if (!open) setDeleteSaleId(null);
        }}
        onConfirm={confirmDeleteSale}
        title="حذف سجل بيع"
      />
    </AppShell>
  );
}
