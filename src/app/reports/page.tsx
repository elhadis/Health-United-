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
  }>;
  nearExpiry: Array<{
    id: string;
    batchId?: string;
    batchNumber?: string;
    name: string;
    availableQty: number;
    expiryDate: string;
    category?: string;
  }>;
};

type SaleItemDetail = {
  productName: string;
  quantity: number;
  unitPrice: number | string;
  costPrice: number | string;
  lineTotal: number | string;
  lineProfit: number | string;
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
    for (const sale of sales) {
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
  }, [sales]);

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
          if (!open) setDrillModal(null);
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

          <div className="max-h-[65vh] overflow-y-auto">
            {loadingSales &&
              drillModal !== "alerts" &&
              drillModal !== null && (
                <p className="py-6 text-center text-sm text-slate-500">
                  جاري تحميل التفاصيل...
                </p>
              )}

            {drillModal === "sales" && !loadingSales && (
              <div className="space-y-3">
                {sales.length === 0 && (
                  <p className="text-sm text-slate-500">
                    لا توجد مبيعات في هذه الفترة
                  </p>
                )}
                {sales.map((sale) => (
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
                {profitRows.length > 0 && (
                  <div className="mt-3 flex justify-between rounded-lg bg-success/5 px-3 py-2 text-sm font-semibold">
                    <span>إجمالي صافي الربح</span>
                    <span className="text-success">
                      {formatCurrency(
                        profitRows.reduce((s, r) => s + r.lineProfit, 0)
                      )}
                    </span>
                  </div>
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
                    {sales.map((sale) => (
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
                {sales.length === 0 && (
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
                        {summary.lowStock.map((p) => (
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
                    {!summary.lowStock.length && (
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
                        {summary.nearExpiry.map((p) => (
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
                    {!summary.nearExpiry.length && (
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
