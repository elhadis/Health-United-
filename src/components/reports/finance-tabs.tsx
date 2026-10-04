"use client";

import { FormEvent, Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  FileText,
  Download,
  Mail,
  MessageCircle,
  Share2,
  Plus,
  Loader2,
  History,
  Trash2,
} from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  downloadOfficialPdf,
  downloadTabularReportPdf,
  getOfficialPdfBlob,
  sharePdfFile,
  shareViaEmail,
  shareViaWhatsApp,
  type OfficialPdfPayload,
} from "@/lib/pdf/official-pdf";
import { COMPANY_NAME_AR } from "@/lib/branding";
import { formatCurrency, formatDate } from "@/lib/utils";

type Installment = {
  id: string;
  amount: number;
  method: string;
  bankName: string | null;
  bankCountry: string | null;
  transactionRef: string | null;
  notes: string | null;
  paidAt: string;
  createdAt: string;
};

type SupplierInvoiceRow = {
  id: string;
  legacy: boolean;
  invoiceNumber: string | null;
  description: string | null;
  invoiceDate: string;
  totalAmount: number;
  supplier: { id: string; name: string; country: string | null } | null;
  payments: Installment[];
};

type IssuedInvoice = {
  id: string;
  receiptNumber: string;
  total: number;
  paymentMethod: string;
  bankAppName?: string | null;
  createdAt: string;
  pharmacyName: string;
  cashierName: string;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    category?: string | null;
  }>;
};

type InvoiceTimeframe = "all" | "today" | "week" | "month";
type InvoiceCategory = "ALL" | "HUMAN" | "VETERINARY";

const INVOICE_TIMEFRAMES: Array<[InvoiceTimeframe, string, string]> = [
  ["all", "كل الفترات", "All"],
  ["today", "يومي", "Daily"],
  ["week", "أسبوعي", "Weekly"],
  ["month", "شهري", "Monthly"],
];

const INVOICE_CATEGORIES: Array<[InvoiceCategory, string, string]> = [
  ["ALL", "الكل", "All"],
  ["HUMAN", "بشري", "Human"],
  ["VETERINARY", "بيطري", "Veterinary"],
];

type PdfPreviewState = {
  title: string;
  filename: string;
  payload: OfficialPdfPayload;
} | null;

type PeriodKey = "all" | "today" | "week" | "month" | "custom";
type PaymentStatus = "PAID" | "PARTIAL" | "UNPAID";

const todayInput = () => new Date().toISOString().slice(0, 10);

const emptyInvoiceForm = () => ({
  supplierName: "",
  invoiceNumber: "",
  totalAmount: "",
  invoiceDate: todayInput(),
  amount: "",
  paidAt: todayInput(),
  method: "BANK_APP",
  bankName: "",
  bankCountry: "",
  transactionRef: "",
  notes: "",
});

const emptyInstallmentForm = () => ({
  amount: "",
  paidAt: todayInput(),
  method: "BANK_APP",
  bankName: "",
  bankCountry: "",
  transactionRef: "",
  notes: "",
});

function periodBounds(period: PeriodKey, from: string, to: string) {
  if (period === "all") return null;
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  if (period === "week") start.setDate(start.getDate() - 6);
  if (period === "month") start.setDate(1);
  if (period === "custom") {
    if (from) {
      const f = new Date(from);
      f.setHours(0, 0, 0, 0);
      start.setTime(f.getTime());
    }
    if (to) {
      const t = new Date(to);
      t.setHours(23, 59, 59, 999);
      end.setTime(t.getTime());
    }
  }
  return { start, end };
}

const PERIOD_LABELS: Record<PeriodKey, string> = {
  all: "الكل",
  today: "اليوم",
  week: "هذا الأسبوع",
  month: "هذا الشهر",
  custom: "تاريخ مخصص",
};

const PERIOD_LABELS_EN: Record<PeriodKey, string> = {
  all: "All time",
  today: "Today",
  week: "This week",
  month: "This month",
  custom: "Custom range",
};

function paidOf(row: SupplierInvoiceRow) {
  return row.payments.reduce((s, p) => s + Number(p.amount || 0), 0);
}

function statusOf(total: number, paid: number): PaymentStatus {
  if (paid >= total - 0.001) return "PAID";
  if (paid > 0) return "PARTIAL";
  return "UNPAID";
}

const STATUS_META: Record<PaymentStatus, { label: string; variant: "success" | "warning" | "danger" }> = {
  PAID: { label: "مدفوع بالكامل", variant: "success" },
  PARTIAL: { label: "دفعة جزئية", variant: "warning" },
  UNPAID: { label: "غير مدفوع", variant: "danger" },
};

const methodLabel = (m: string) => (m === "CASH" ? "نقدي" : "تحويل بنكي");

const money = (n: number) =>
  `${Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} SDG`;

const dateEn = (iso: string) => new Date(iso).toLocaleDateString("en-GB");

async function fetchSupplierInvoices() {
  const res = await fetch("/api/supplier-invoices");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "فشل جلب مدفوعات الموردين");
  return (data.invoices ?? []) as SupplierInvoiceRow[];
}

async function fetchIssuedInvoices(fromIso?: string) {
  const res = await fetch(
    fromIso ? `/api/sales?from=${encodeURIComponent(fromIso)}` : "/api/sales"
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "فشل جلب الفواتير");
  const sales = data.sales ?? [];
  return sales.map(
    (s: {
      id: string;
      receiptNumber: string;
      total: number | string;
      paymentMethod: string;
      bankAppName?: string | null;
      createdAt: string;
      pharmacy?: { name?: string } | null;
      cashier?: { name?: string } | null;
      items?: Array<{
        productName: string;
        quantity: number;
        unitPrice: number | string;
        lineTotal: number | string;
        product?: { category?: string | null } | null;
      }>;
    }) =>
      ({
        id: s.id,
        receiptNumber: s.receiptNumber,
        total: Number(s.total),
        paymentMethod: s.paymentMethod,
        bankAppName: s.bankAppName,
        createdAt: s.createdAt,
        pharmacyName: s.pharmacy?.name || "صيدلية",
        cashierName: s.cashier?.name || "—",
        items: (s.items ?? []).map((i) => ({
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: Number(i.unitPrice),
          lineTotal: Number(i.lineTotal),
          category: i.product?.category ?? null,
        })),
      }) as IssuedInvoice
  );
}

export function FinanceTabs() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"payments" | "invoices">("payments");
  const [openForm, setOpenForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState>(null);
  const [busyPdf, setBusyPdf] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState(emptyInvoiceForm);

  const [period, setPeriod] = useState<PeriodKey>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [installmentTarget, setInstallmentTarget] = useState<SupplierInvoiceRow | null>(null);
  const [installmentForm, setInstallmentForm] = useState(emptyInstallmentForm);
  const [installmentError, setInstallmentError] = useState<string | null>(null);
  const [savingInstallment, setSavingInstallment] = useState(false);

  const { data: supplierInvoices = [], isLoading: loadingPayments } = useQuery({
    queryKey: ["supplier-invoices"],
    queryFn: fetchSupplierInvoices,
  });

  const isSuperAdmin = useAuthStore((s) => s.user?.role === "ADMINISTRATOR");
  const [deletePaymentId, setDeletePaymentId] = useState<string | null>(null);
  const [paymentMsg, setPaymentMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const confirmDeletePayment = async () => {
    const id = deletePaymentId;
    if (!id) return;
    try {
      const res = await fetch(`/api/payments/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPaymentMsg({ ok: false, text: data.error || "فشل حذف الدفعة" });
        return;
      }
      queryClient.setQueryData<SupplierInvoiceRow[]>(["supplier-invoices"], (prev) =>
        (prev ?? [])
          .filter((row) => row.id !== `legacy-${id}`)
          .map((row) =>
            row.payments.some((p) => p.id === id)
              ? { ...row, payments: row.payments.filter((p) => p.id !== id) }
              : row
          )
      );
      setPaymentMsg({ ok: true, text: "تم حذف الدفعة وإعادة احتساب الرصيد" });
      void queryClient.invalidateQueries({ queryKey: ["supplier-invoices"] });
    } catch {
      setPaymentMsg({ ok: false, text: "تعذر الاتصال بالخادم" });
    } finally {
      setDeletePaymentId(null);
    }
  };

  const [invoiceTimeframe, setInvoiceTimeframe] = useState<InvoiceTimeframe>("all");
  const [invoiceCategory, setInvoiceCategory] = useState<InvoiceCategory>("ALL");
  const [exportingInvoices, setExportingInvoices] = useState(false);
  const invoiceBounds = useMemo(
    () => periodBounds(invoiceTimeframe, "", ""),
    [invoiceTimeframe]
  );

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ["issued-invoices", invoiceTimeframe],
    queryFn: () => fetchIssuedInvoices(invoiceBounds?.start.toISOString()),
  });

  const filteredInvoices = useMemo(
    () =>
      (invoices as IssuedInvoice[]).filter((inv) => {
        if (invoiceBounds) {
          const t = new Date(inv.createdAt).getTime();
          if (t < invoiceBounds.start.getTime() || t > invoiceBounds.end.getTime()) {
            return false;
          }
        }
        if (invoiceCategory === "ALL") return true;
        return inv.items.some((i) => i.category === invoiceCategory);
      }),
    [invoices, invoiceBounds, invoiceCategory]
  );

  const supplierNames = useMemo(
    () =>
      Array.from(
        new Set(supplierInvoices.map((r) => r.supplier?.name).filter(Boolean) as string[])
      ).sort((a, b) => a.localeCompare(b, "ar")),
    [supplierInvoices]
  );

  const bounds = useMemo(
    () => periodBounds(period, customFrom, customTo),
    [period, customFrom, customTo]
  );

  const inBounds = (iso: string) => {
    if (!bounds) return true;
    const t = new Date(iso).getTime();
    return t >= bounds.start.getTime() && t <= bounds.end.getTime();
  };

  const filteredRows = useMemo(
    () =>
      supplierInvoices.filter((row) => {
        if (supplierFilter !== "ALL" && row.supplier?.name !== supplierFilter) return false;
        if (!bounds) return true;
        return inBounds(row.invoiceDate) || row.payments.some((p) => inBounds(p.paidAt));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [supplierInvoices, supplierFilter, bounds]
  );

  const totals = useMemo(() => {
    let contracts = 0;
    let paid = 0;
    let paidInPeriod = 0;
    for (const row of filteredRows) {
      contracts += row.totalAmount;
      for (const p of row.payments) {
        paid += p.amount;
        if (inBounds(p.paidAt)) paidInPeriod += p.amount;
      }
    }
    return { contracts, paid, remaining: Math.max(0, contracts - paid), paidInPeriod };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRows, bounds]);

  const invoiceTotal = useMemo(
    () => filteredInvoices.reduce((s: number, i: IssuedInvoice) => s + Number(i.total), 0),
    [filteredInvoices]
  );

  const exportInvoicesPdf = async () => {
    setExportingInvoices(true);
    try {
      const tf = INVOICE_TIMEFRAMES.find(([k]) => k === invoiceTimeframe)!;
      const cat = INVOICE_CATEGORIES.find(([k]) => k === invoiceCategory)!;
      await downloadTabularReportPdf(
        {
          title: "Issued Invoices Report",
          titleAr: "تقرير الفواتير الصادرة",
          reference: `INV-${Date.now().toString(36).toUpperCase()}`,
          date: new Date().toLocaleString("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          meta: [
            { label: "Period / الفترة", value: `${tf[2]} · ${tf[1]}` },
            {
              label: "Range / النطاق",
              value: invoiceBounds
                ? `${invoiceBounds.start.toLocaleDateString("en-GB")} - ${invoiceBounds.end.toLocaleDateString("en-GB")}`
                : "All records · كل السجلات",
            },
            { label: "Category / التصنيف", value: `${cat[2]} · ${cat[1]}` },
          ],
          summaryCards: [
            { labelEn: "Invoices", labelAr: "عدد الفواتير", value: String(filteredInvoices.length) },
            { labelEn: "Total", labelAr: "إجمالي الفواتير", value: money(invoiceTotal) },
            {
              labelEn: "Average",
              labelAr: "متوسط الفاتورة",
              value: money(filteredInvoices.length ? invoiceTotal / filteredInvoices.length : 0),
            },
          ],
          sections: [
            {
              columns: [
                { en: "Invoice", ar: "الفاتورة", width: 0.18 },
                { en: "Party", ar: "الجهة", width: 0.22 },
                { en: "Items", ar: "الأصناف", width: 0.1, align: "center" },
                { en: "Units", ar: "الوحدات", width: 0.1, align: "center" },
                { en: "Total", ar: "الإجمالي", width: 0.22, align: "right" },
                { en: "Date", ar: "التاريخ", width: 0.18, align: "center" },
              ],
              rows: filteredInvoices.map((inv) => [
                inv.receiptNumber,
                inv.pharmacyName,
                String(inv.items.length),
                String(inv.items.reduce((s, i) => s + Number(i.quantity || 0), 0)),
                money(inv.total),
                dateEn(inv.createdAt),
              ]),
              emptyText: "لا توجد فواتير مطابقة",
            },
          ],
        },
        `issued-invoices-${invoiceTimeframe}${invoiceCategory === "ALL" ? "" : `-${invoiceCategory.toLowerCase()}`}-${todayInput()}.pdf`
      );
    } finally {
      setExportingInvoices(false);
    }
  };

  const createInvoice = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const total = Number.parseFloat(form.totalAmount);
    const first = form.amount ? Number.parseFloat(form.amount) : 0;
    if (!Number.isFinite(total) || total <= 0) {
      setFormError("إجمالي قيمة الفاتورة غير صالح");
      return;
    }
    if (!Number.isFinite(first) || first < 0 || first > total) {
      setFormError("المبلغ المدفوع يجب أن يكون بين 0 وإجمالي الفاتورة");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/supplier-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierName: form.supplierName,
          invoiceNumber: form.invoiceNumber || undefined,
          totalAmount: total,
          invoiceDate: form.invoiceDate || undefined,
          description: form.notes || undefined,
          initialPayment:
            first > 0
              ? {
                  amount: first,
                  paidAt: form.paidAt || undefined,
                  method: form.method,
                  bankName: form.bankName || undefined,
                  bankCountry: form.bankCountry || undefined,
                  transactionRef: form.transactionRef || undefined,
                }
              : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "فشل التسجيل");
      setOpenForm(false);
      setForm(emptyInvoiceForm());
      setFormMsg("تم تسجيل فاتورة المورد بنجاح");
      void queryClient.invalidateQueries({ queryKey: ["supplier-invoices"] });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "فشل التسجيل");
    } finally {
      setSaving(false);
    }
  };

  const openInstallment = (row: SupplierInvoiceRow) => {
    const remaining = Math.max(0, row.totalAmount - paidOf(row));
    setInstallmentTarget(row);
    setInstallmentError(null);
    setInstallmentForm({ ...emptyInstallmentForm(), amount: remaining ? String(remaining) : "" });
  };

  const installmentPreview = useMemo(() => {
    if (!installmentTarget) return null;
    const paid = paidOf(installmentTarget);
    const add = Number.parseFloat(installmentForm.amount) || 0;
    return {
      total: installmentTarget.totalAmount,
      paid,
      newPaid: paid + add,
      newRemaining: installmentTarget.totalAmount - paid - add,
    };
  }, [installmentTarget, installmentForm.amount]);

  const saveInstallment = async (e: FormEvent) => {
    e.preventDefault();
    const row = installmentTarget;
    if (!row || !installmentPreview) return;
    setInstallmentError(null);
    const amount = Number.parseFloat(installmentForm.amount);
    const remaining = row.totalAmount - installmentPreview.paid;
    if (!Number.isFinite(amount) || amount <= 0) {
      setInstallmentError("مبلغ الدفعة غير صالح");
      return;
    }
    if (amount > remaining + 0.001) {
      setInstallmentError(`المبلغ يتجاوز المتبقي (${formatCurrency(remaining)})`);
      return;
    }
    setSavingInstallment(true);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: row.id,
          supplierName: row.supplier?.name,
          amount,
          paidAt: installmentForm.paidAt || undefined,
          method: installmentForm.method,
          bankName: installmentForm.bankName || undefined,
          bankCountry: installmentForm.bankCountry || undefined,
          transactionRef: installmentForm.transactionRef || undefined,
          notes: installmentForm.notes || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "فشل تسجيل الدفعة");
      setInstallmentTarget(null);
      setExpandedId(row.id);
      setFormMsg(`تم تسجيل دفعة ${formatCurrency(amount)} لـ ${row.supplier?.name ?? "المورد"}`);
      void queryClient.invalidateQueries({ queryKey: ["supplier-invoices"] });
    } catch (err) {
      setInstallmentError(err instanceof Error ? err.message : "فشل تسجيل الدفعة");
    } finally {
      setSavingInstallment(false);
    }
  };

  const openPaymentPdf = (row: SupplierInvoiceRow) => {
    const paid = paidOf(row);
    const remaining = Math.max(0, row.totalAmount - paid);
    const ref = row.invoiceNumber || `SUP-${row.id.slice(-8).toUpperCase()}`;
    const company = row.supplier?.name || "مورد";
    setPdfPreview({
      title: "كشف دفعات مورد · Supplier Payment Statement",
      filename: `${ref}.pdf`,
      payload: {
        title: "Supplier Payment Statement",
        reference: ref,
        date: new Date(row.invoiceDate).toLocaleDateString("en-GB"),
        partyLabel: "Supplier / المورد",
        partyName: company,
        meta: [
          { label: "Invoice total / إجمالي الفاتورة", value: money(row.totalAmount) },
          { label: "Paid / المدفوع", value: money(paid) },
          { label: "Remaining / المتبقي", value: money(remaining) },
          { label: "Status / الحالة", value: STATUS_META[statusOf(row.totalAmount, paid)].label },
        ],
        items: row.payments.map((p, i) => ({
          name: `دفعة ${i + 1} · ${dateEn(p.paidAt)} · ${methodLabel(p.method)}${p.bankName ? ` · ${p.bankName}` : ""}`,
          quantity: 1,
          unitPrice: p.amount,
          total: p.amount,
        })),
        totalLabel: "Total paid",
        totalAmount: paid,
        notes: row.description || undefined,
      },
    });
  };

  const exportFilteredPdf = async () => {
    setExporting(true);
    try {
      const periodRange = bounds
        ? `${bounds.start.toLocaleDateString("en-GB")} - ${bounds.end.toLocaleDateString("en-GB")}`
        : "All records · كل السجلات";
      const schedule = filteredRows
        .flatMap((row) =>
          row.payments
            .filter((p) => inBounds(p.paidAt))
            .map((p) => ({ row, p }))
        )
        .sort((a, b) => new Date(a.p.paidAt).getTime() - new Date(b.p.paidAt).getTime());

      await downloadTabularReportPdf(
        {
          title: "Supplier Payments Report",
          titleAr: "تقرير مدفوعات الموردين",
          reference: `SUP-${Date.now().toString(36).toUpperCase()}`,
          date: new Date().toLocaleString("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          meta: [
            { label: "Period / الفترة", value: `${PERIOD_LABELS_EN[period]} · ${PERIOD_LABELS[period]}` },
            { label: "Range / النطاق", value: periodRange },
            {
              label: "Supplier / المورد",
              value: supplierFilter === "ALL" ? "All · الكل" : supplierFilter,
            },
            { label: "Invoices / الفواتير", value: String(filteredRows.length) },
          ],
          summaryCards: [
            { labelEn: "Total Contracts", labelAr: "إجمالي العقود", value: money(totals.contracts) },
            { labelEn: "Total Paid", labelAr: "إجمالي المدفوع", value: money(totals.paid) },
            { labelEn: "Outstanding", labelAr: "المتبقي", value: money(totals.remaining) },
          ],
          sections: [
            {
              heading: "Invoices & Balances",
              headingAr: "الفواتير والأرصدة",
              columns: [
                { en: "Supplier", ar: "المورد", width: 0.22 },
                { en: "Invoice No", ar: "رقم الفاتورة", width: 0.13 },
                { en: "Date", ar: "التاريخ", width: 0.11, align: "center" },
                { en: "Total", ar: "الإجمالي", width: 0.14, align: "right" },
                { en: "Paid", ar: "المدفوع", width: 0.14, align: "right" },
                { en: "Remaining", ar: "المتبقي", width: 0.13, align: "right" },
                { en: "Status", ar: "الحالة", width: 0.13, align: "center" },
              ],
              rows: filteredRows.map((row) => {
                const paid = paidOf(row);
                return [
                  row.supplier?.name ?? "—",
                  row.invoiceNumber || "-",
                  dateEn(row.invoiceDate),
                  money(row.totalAmount),
                  money(paid),
                  money(Math.max(0, row.totalAmount - paid)),
                  STATUS_META[statusOf(row.totalAmount, paid)].label,
                ];
              }),
              emptyText: "لا توجد فواتير",
            },
            {
              heading: `Payment Schedule (paid in period: ${money(totals.paidInPeriod)})`,
              headingAr: "سجل الدفعات",
              columns: [
                { en: "Date", ar: "التاريخ", width: 0.12, align: "center" },
                { en: "Supplier", ar: "المورد", width: 0.22 },
                { en: "Invoice No", ar: "رقم الفاتورة", width: 0.14 },
                { en: "Method", ar: "طريقة الدفع", width: 0.14, align: "center" },
                { en: "Bank / Ref", ar: "البنك / المرجع", width: 0.2 },
                { en: "Amount", ar: "المبلغ", width: 0.18, align: "right" },
              ],
              rows: schedule.map(({ row, p }) => [
                dateEn(p.paidAt),
                row.supplier?.name ?? "—",
                row.invoiceNumber || "-",
                methodLabel(p.method),
                [p.bankName, p.transactionRef].filter(Boolean).join(" · ") || "-",
                money(p.amount),
              ]),
              emptyText: "لا توجد دفعات في هذه الفترة",
            },
          ],
        },
        `supplier-payments-${period}-${todayInput()}.pdf`
      );
    } finally {
      setExporting(false);
    }
  };

  const openInvoicePdf = (inv: IssuedInvoice) => {
    setPdfPreview({
      title: "فاتورة صادرة · Issued Invoice",
      filename: `${inv.receiptNumber}.pdf`,
      payload: {
        title: "Issued Invoice",
        reference: inv.receiptNumber,
        date: new Date(inv.createdAt).toLocaleString("en-GB"),
        partyLabel: "Billed to",
        partyName: inv.pharmacyName,
        meta: [
          { label: "Cashier", value: inv.cashierName },
          {
            label: "Payment method",
            value:
              inv.paymentMethod === "BANK_APP"
                ? `Bank app${inv.bankAppName ? ` (${inv.bankAppName})` : ""}`
                : "Cash",
          },
        ],
        items:
          inv.items.length > 0
            ? inv.items.map((i) => ({
                name: i.productName,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                total: i.lineTotal,
              }))
            : [
                {
                  name: "Sale total",
                  quantity: 1,
                  unitPrice: inv.total,
                  total: inv.total,
                },
              ],
        totalAmount: inv.total,
      },
    });
  };

  const handleDownload = async () => {
    if (!pdfPreview) return;
    setBusyPdf(true);
    try {
      await downloadOfficialPdf(pdfPreview.payload, pdfPreview.filename);
    } finally {
      setBusyPdf(false);
    }
  };

  const handleShareNative = async () => {
    if (!pdfPreview) return;
    setBusyPdf(true);
    try {
      const blob = await getOfficialPdfBlob(pdfPreview.payload);
      const text = `${COMPANY_NAME_AR}\n${pdfPreview.payload.title}\nRef: ${pdfPreview.payload.reference}\nTotal: ${pdfPreview.payload.totalAmount}`;
      await sharePdfFile(
        blob,
        pdfPreview.filename,
        pdfPreview.payload.title,
        text
      );
    } finally {
      setBusyPdf(false);
    }
  };

  const handleEmail = () => {
    if (!pdfPreview) return;
    shareViaEmail(
      `${pdfPreview.payload.title} — ${pdfPreview.payload.reference}`,
      `${COMPANY_NAME_AR}\n${pdfPreview.payload.title}\nReference: ${pdfPreview.payload.reference}\nDate: ${pdfPreview.payload.date}\n${pdfPreview.payload.partyLabel}: ${pdfPreview.payload.partyName}\nTotal: ${pdfPreview.payload.totalAmount}\n\nتم إنشاء المستند الرسمي من نظام هيلث المتحدة المحدودة. يرجى تحميل ملف PDF من النظام وإرفاقه.`
    );
  };

  const handleWhatsApp = () => {
    if (!pdfPreview) return;
    shareViaWhatsApp(
      `${COMPANY_NAME_AR}\n${pdfPreview.payload.title}\nالمرجع: ${pdfPreview.payload.reference}\nالتاريخ: ${pdfPreview.payload.date}\nالإجمالي: ${pdfPreview.payload.totalAmount}\n\nمستند رسمي — يرجى طلب ملف PDF من النظام.`
    );
  };

  return (
    <div className="no-print space-y-4">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
        <Button
          type="button"
          variant={tab === "payments" ? "default" : "ghost"}
          className="flex-1 sm:flex-none"
          onClick={() => setTab("payments")}
        >
          <Building2 className="h-4 w-4" />
          مدفوعات الموردين
        </Button>
        <Button
          type="button"
          variant={tab === "invoices" ? "default" : "ghost"}
          className="flex-1 sm:flex-none"
          onClick={() => setTab("invoices")}
        >
          <FileText className="h-4 w-4" />
          الفواتير الصادرة
        </Button>
      </div>

      {formMsg && (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {formMsg}
        </p>
      )}

      {tab === "payments" && (
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                مدفوعات الموردين
              </CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                إجمالي العقود: {formatCurrency(totals.contracts)} · المدفوع:{" "}
                {formatCurrency(totals.paid)} · المتبقي:{" "}
                <span className="font-semibold text-danger">
                  {formatCurrency(totals.remaining)}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={exporting || loadingPayments}
                onClick={() => void exportFilteredPdf()}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                تصدير PDF
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setFormError(null);
                  setOpenForm(true);
                }}
              >
                <Plus className="h-4 w-4" />
                تسجيل دفعة
              </Button>
            </div>
          </CardHeader>
          <CardContent className="table-scroll overflow-x-auto p-0">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 pb-4">
              {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={period === key ? "default" : "outline"}
                  onClick={() => setPeriod(key)}
                >
                  {PERIOD_LABELS[key]}
                </Button>
              ))}
              <select
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
              >
                <option value="ALL">كل الموردين</option>
                {supplierNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {period === "custom" && (
                <>
                  <Input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-9 max-w-[160px]"
                  />
                  <Input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-9 max-w-[160px]"
                  />
                </>
              )}
            </div>
            {paymentMsg && (
              <p
                className={
                  paymentMsg.ok
                    ? "mx-4 mb-3 rounded-lg bg-success/10 px-3 py-2 text-sm text-emerald-700"
                    : "mx-4 mb-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-700"
                }
              >
                {paymentMsg.text}
              </p>
            )}
            {loadingPayments ? (
              <p className="p-5 text-sm text-slate-500">جاري التحميل...</p>
            ) : (
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium">الشركة</th>
                    <th className="px-4 py-3 text-right font-medium">إجمالي الفاتورة</th>
                    <th className="px-4 py-3 text-right font-medium">المدفوع</th>
                    <th className="px-4 py-3 text-right font-medium">المتبقي</th>
                    <th className="px-4 py-3 text-right font-medium">الحالة</th>
                    <th className="px-4 py-3 text-right font-medium">آخر دفعة</th>
                    <th className="px-4 py-3 text-right font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const paid = paidOf(row);
                    const remaining = Math.max(0, row.totalAmount - paid);
                    const status = STATUS_META[statusOf(row.totalAmount, paid)];
                    const last = row.payments[row.payments.length - 1];
                    const expanded = expandedId === row.id;
                    return (
                      <Fragment key={row.id}>
                        <tr className="border-t border-slate-100">
                          <td className="px-4 py-3">
                            <p className="font-medium">{row.supplier?.name ?? "—"}</p>
                            <p className="text-xs text-slate-500">
                              {row.invoiceNumber ? `${row.invoiceNumber} · ` : ""}
                              {formatDate(row.invoiceDate)}
                            </p>
                          </td>
                          <td className="px-4 py-3 font-semibold">
                            {formatCurrency(row.totalAmount)}
                          </td>
                          <td className="px-4 py-3 font-semibold text-primary">
                            {formatCurrency(paid)}
                          </td>
                          <td
                            className={`px-4 py-3 font-semibold ${
                              remaining > 0 ? "text-danger" : "text-slate-400"
                            }`}
                          >
                            {formatCurrency(remaining)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={status.variant}>{status.label}</Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {last ? (
                              <>
                                {formatDate(last.paidAt)}
                                <br />
                                {methodLabel(last.method)}
                                {last.bankName ? ` · ${last.bankName}` : ""}
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                disabled={row.legacy || remaining <= 0}
                                onClick={() => openInstallment(row)}
                              >
                                <Plus className="h-3.5 w-3.5" />
                                تسجيل دفعة
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setExpandedId(expanded ? null : row.id)}
                              >
                                <History className="h-3.5 w-3.5" />
                                السجل ({row.payments.length})
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => openPaymentPdf(row)}
                              >
                                <FileText className="h-3.5 w-3.5" />
                                PDF
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="bg-slate-50/60">
                            <td colSpan={7} className="px-4 py-3">
                              {row.payments.length === 0 ? (
                                <p className="text-sm text-slate-500">لا توجد دفعات بعد</p>
                              ) : (
                                <ol className="space-y-2">
                                  {row.payments.map((p, idx) => {
                                    const cumulative = row.payments
                                      .slice(0, idx + 1)
                                      .reduce((s, x) => s + x.amount, 0);
                                    return (
                                      <li
                                        key={p.id}
                                        className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-slate-100 bg-white px-3 py-2 text-xs"
                                      >
                                        <span className="font-semibold text-secondary">
                                          دفعة {idx + 1}
                                        </span>
                                        <span>{formatDate(p.paidAt)}</span>
                                        <Badge variant={p.method === "CASH" ? "default" : "indigo"}>
                                          {methodLabel(p.method)}
                                        </Badge>
                                        <span className="text-slate-500">
                                          {[p.bankName, p.bankCountry, p.transactionRef]
                                            .filter(Boolean)
                                            .join(" · ") || "—"}
                                        </span>
                                        <span className="font-semibold text-primary">
                                          {formatCurrency(p.amount)}
                                        </span>
                                        <span className="text-slate-500">
                                          المتبقي بعدها:{" "}
                                          {formatCurrency(Math.max(0, row.totalAmount - cumulative))}
                                        </span>
                                        {p.notes && (
                                          <span className="text-slate-400">{p.notes}</span>
                                        )}
                                        {isSuperAdmin && (
                                          <Button
                                            type="button"
                                            variant="danger"
                                            size="sm"
                                            className="ms-auto h-7 px-2 text-xs"
                                            onClick={() => {
                                              setPaymentMsg(null);
                                              setDeletePaymentId(p.id);
                                            }}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                            حذف
                                          </Button>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ol>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
            {!loadingPayments && filteredRows.length === 0 && (
              <p className="p-5 text-sm text-slate-500">لا توجد مدفوعات مسجلة</p>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "invoices" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              الفواتير الصادرة
            </CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              إجمالي الفواتير: {formatCurrency(invoiceTotal)} ·{" "}
              {filteredInvoices.length} فاتورة
            </p>
            {isSuperAdmin && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {INVOICE_TIMEFRAMES.map(([key, label]) => (
                  <Button
                    key={key}
                    type="button"
                    size="sm"
                    variant={invoiceTimeframe === key ? "default" : "outline"}
                    onClick={() => setInvoiceTimeframe(key)}
                  >
                    {label}
                  </Button>
                ))}
                <span className="mx-1 h-5 w-px bg-slate-200" />
                {INVOICE_CATEGORIES.map(([key, label]) => (
                  <Button
                    key={key}
                    type="button"
                    size="sm"
                    variant={invoiceCategory === key ? "default" : "outline"}
                    onClick={() => setInvoiceCategory(key)}
                  >
                    {label}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ms-auto"
                  disabled={exportingInvoices || loadingInvoices}
                  onClick={() => void exportInvoicesPdf()}
                >
                  {exportingInvoices ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  تصدير PDF
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="table-scroll overflow-x-auto p-0">
            {loadingInvoices ? (
              <p className="p-5 text-sm text-slate-500">جاري التحميل...</p>
            ) : (
              <table className="w-full min-w-[780px] text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium">الفاتورة</th>
                    <th className="px-4 py-3 text-right font-medium">الجهة</th>
                    <th className="px-4 py-3 text-right font-medium">الأصناف</th>
                    <th className="px-4 py-3 text-right font-medium">الإجمالي</th>
                    <th className="px-4 py-3 text-right font-medium">التاريخ</th>
                    <th className="px-4 py-3 text-right font-medium">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInvoices.map((inv: IssuedInvoice) => (
                    <tr key={inv.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium">
                        {inv.receiptNumber}
                      </td>
                      <td className="px-4 py-3">{inv.pharmacyName}</td>
                      <td className="px-4 py-3">
                        <div className="flex max-w-xs flex-wrap gap-1">
                          {inv.items.slice(0, 3).map((item, idx: number) => (
                            <Badge key={idx} variant="outline">
                              {item.productName} × {item.quantity} ·{" "}
                              {formatCurrency(item.unitPrice)}
                            </Badge>
                          ))}
                          {inv.items.length > 3 && (
                            <Badge variant="secondary">
                              +{inv.items.length - 3}
                            </Badge>
                          )}
                          {inv.items.length === 0 && "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-primary">
                        {formatCurrency(inv.total)}
                      </td>
                      <td className="px-4 py-3">{formatDate(inv.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openInvoicePdf(inv)}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          PDF
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!loadingInvoices && filteredInvoices.length === 0 && (
              <p className="p-5 text-sm text-slate-500">لا توجد فواتير صادرة</p>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>تسجيل دفعة مورد</DialogTitle>
          </DialogHeader>
          <form onSubmit={createInvoice} className="grid gap-3">
            <Input
              required
              placeholder="اسم شركة المورد"
              value={form.supplierName}
              onChange={(e) =>
                setForm({ ...form, supplierName: e.target.value })
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="رقم الفاتورة / العقد"
                value={form.invoiceNumber}
                onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
              />
              <Input
                type="date"
                title="تاريخ الفاتورة"
                value={form.invoiceDate}
                onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
              />
            </div>
            <Input
              required
              type="number"
              min="0"
              step="0.01"
              placeholder="إجمالي قيمة الفاتورة / العقد"
              value={form.totalAmount}
              onChange={(e) => setForm({ ...form, totalAmount: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="المبلغ المدفوع الآن (اختياري)"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
              <Input
                type="date"
                title="تاريخ الدفعة"
                value={form.paidAt}
                onChange={(e) => setForm({ ...form, paidAt: e.target.value })}
              />
            </div>
            {form.totalAmount && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                المتبقي بعد هذه الدفعة:{" "}
                <span className="font-semibold text-danger">
                  {formatCurrency(
                    Math.max(
                      0,
                      (Number.parseFloat(form.totalAmount) || 0) -
                        (Number.parseFloat(form.amount) || 0)
                    )
                  )}
                </span>
              </p>
            )}
            <select
              className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              value={form.method}
              onChange={(e) => setForm({ ...form, method: e.target.value })}
            >
              <option value="BANK_APP">تحويل بنكي</option>
              <option value="CASH">نقدي</option>
            </select>
            <Input
              placeholder="اسم البنك"
              value={form.bankName}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })}
            />
            <Input
              placeholder="دولة البنك / الشركة"
              value={form.bankCountry}
              onChange={(e) =>
                setForm({ ...form, bankCountry: e.target.value })
              }
            />
            <Input
              placeholder="مرجع التحويل"
              value={form.transactionRef}
              onChange={(e) =>
                setForm({ ...form, transactionRef: e.target.value })
              }
            />
            <Input
              placeholder="ملاحظات"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            {formError && (
              <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-700">
                {formError}
              </p>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ الدفعة"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!installmentTarget}
        onOpenChange={(open) => {
          if (!open && !savingInstallment) setInstallmentTarget(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              تسجيل دفعة — {installmentTarget?.supplier?.name ?? "مورد"}
            </DialogTitle>
          </DialogHeader>
          {installmentTarget && installmentPreview && (
            <form onSubmit={saveInstallment} className="grid gap-3">
              <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-xs">
                <div>
                  <p className="text-slate-500">الإجمالي</p>
                  <p className="mt-1 font-bold">{formatCurrency(installmentPreview.total)}</p>
                </div>
                <div>
                  <p className="text-slate-500">المدفوع بعد الدفعة</p>
                  <p className="mt-1 font-bold text-primary">
                    {formatCurrency(installmentPreview.newPaid)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">المتبقي بعد الدفعة</p>
                  <p
                    className={`mt-1 font-bold ${
                      installmentPreview.newRemaining < -0.001 ? "text-red-700" : "text-danger"
                    }`}
                  >
                    {formatCurrency(Math.max(0, installmentPreview.newRemaining))}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="مبلغ الدفعة"
                  value={installmentForm.amount}
                  onChange={(e) =>
                    setInstallmentForm({ ...installmentForm, amount: e.target.value })
                  }
                />
                <Input
                  required
                  type="date"
                  title="تاريخ الدفعة"
                  value={installmentForm.paidAt}
                  onChange={(e) =>
                    setInstallmentForm({ ...installmentForm, paidAt: e.target.value })
                  }
                />
              </div>
              <select
                className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
                value={installmentForm.method}
                onChange={(e) =>
                  setInstallmentForm({ ...installmentForm, method: e.target.value })
                }
              >
                <option value="BANK_APP">تحويل بنكي</option>
                <option value="CASH">نقدي</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="اسم البنك"
                  value={installmentForm.bankName}
                  onChange={(e) =>
                    setInstallmentForm({ ...installmentForm, bankName: e.target.value })
                  }
                />
                <Input
                  placeholder="دولة البنك"
                  value={installmentForm.bankCountry}
                  onChange={(e) =>
                    setInstallmentForm({ ...installmentForm, bankCountry: e.target.value })
                  }
                />
              </div>
              <Input
                placeholder="مرجع التحويل"
                value={installmentForm.transactionRef}
                onChange={(e) =>
                  setInstallmentForm({ ...installmentForm, transactionRef: e.target.value })
                }
              />
              <Input
                placeholder="ملاحظات"
                value={installmentForm.notes}
                onChange={(e) =>
                  setInstallmentForm({ ...installmentForm, notes: e.target.value })
                }
              />
              {installmentError && (
                <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-700">
                  {installmentError}
                </p>
              )}
              <Button type="submit" disabled={savingInstallment}>
                {savingInstallment ? "جاري الحفظ..." : "حفظ الدفعة"}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!pdfPreview}
        onOpenChange={(open) => {
          if (!open) setPdfPreview(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{pdfPreview?.title || "معاينة PDF"}</DialogTitle>
          </DialogHeader>
          {pdfPreview && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="font-semibold text-secondary">{COMPANY_NAME_AR}</p>
                <p className="mt-2 text-slate-600">
                  المرجع: {pdfPreview.payload.reference}
                </p>
                <p className="text-slate-600">
                  التاريخ: {pdfPreview.payload.date}
                </p>
                <p className="text-slate-600">
                  {pdfPreview.payload.partyLabel}: {pdfPreview.payload.partyName}
                </p>
                <p className="mt-2 font-bold text-primary">
                  الإجمالي: {formatCurrency(pdfPreview.payload.totalAmount)}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  يتضمن الشعار والعنوان الرسمي وجدول البنود عند التنزيل.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Button
                  type="button"
                  disabled={busyPdf}
                  onClick={handleDownload}
                >
                  {busyPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  تنزيل
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busyPdf}
                  onClick={handleShareNative}
                >
                  <Share2 className="h-4 w-4" />
                  مشاركة
                </Button>
                <Button type="button" variant="outline" onClick={handleEmail}>
                  <Mail className="h-4 w-4" />
                  بريد
                </Button>
                <Button
                  type="button"
                  variant="indigo"
                  onClick={handleWhatsApp}
                >
                  <MessageCircle className="h-4 w-4" />
                  واتساب
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deletePaymentId}
        onOpenChange={(open) => {
          if (!open) setDeletePaymentId(null);
        }}
        onConfirm={confirmDeletePayment}
        title="حذف دفعة"
        description="هل أنت تأكد من حذف هذه الدفعة نهائياً؟"
      />
    </div>
  );
}
