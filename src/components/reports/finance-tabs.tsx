"use client";

import { FormEvent, useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  downloadOfficialPdf,
  getOfficialPdfBlob,
  sharePdfFile,
  shareViaEmail,
  shareViaWhatsApp,
  type OfficialPdfPayload,
} from "@/lib/pdf/official-pdf";
import { COMPANY_NAME_AR } from "@/lib/branding";
import { formatCurrency, formatDate } from "@/lib/utils";

type SupplierPayment = {
  id: string;
  amount: number;
  method: string;
  bankName: string | null;
  bankCountry: string | null;
  transactionRef: string | null;
  notes: string | null;
  createdAt: string;
  supplier: {
    id: string;
    name: string;
    country: string | null;
  } | null;
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
  }>;
};

type PdfPreviewState = {
  title: string;
  filename: string;
  payload: OfficialPdfPayload;
} | null;

async function fetchPayments() {
  const res = await fetch("/api/payments?type=SUPPLIER");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "فشل جلب المدفوعات");
  return (data.payments ?? []) as SupplierPayment[];
}

async function fetchIssuedInvoices() {
  const res = await fetch("/api/sales");
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
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState>(null);
  const [busyPdf, setBusyPdf] = useState(false);
  const [form, setForm] = useState({
    supplierName: "",
    amount: "",
    method: "BANK_APP",
    bankName: "",
    bankCountry: "",
    transactionRef: "",
    notes: "",
  });

  const { data: payments = [], isLoading: loadingPayments } = useQuery({
    queryKey: ["supplier-payments"],
    queryFn: fetchPayments,
  });

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ["issued-invoices"],
    queryFn: fetchIssuedInvoices,
  });

  const paymentTotal = useMemo(
    () => payments.reduce((s: number, p: SupplierPayment) => s + Number(p.amount), 0),
    [payments]
  );
  const invoiceTotal = useMemo(
    () => invoices.reduce((s: number, i: IssuedInvoice) => s + Number(i.total), 0),
    [invoices]
  );

  const createPayment = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormMsg(null);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierName: form.supplierName,
          companyName: form.supplierName,
          amount: Number(form.amount),
          method: form.method,
          bankName: form.bankName || undefined,
          bankCountry: form.bankCountry || undefined,
          transactionRef: form.transactionRef || undefined,
          notes: form.notes || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "فشل التسجيل");
      setOpenForm(false);
      setForm({
        supplierName: "",
        amount: "",
        method: "BANK_APP",
        bankName: "",
        bankCountry: "",
        transactionRef: "",
        notes: "",
      });
      setFormMsg("تم تسجيل دفعة المورد بنجاح");
      void queryClient.invalidateQueries({ queryKey: ["supplier-payments"] });
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "فشل التسجيل");
    } finally {
      setSaving(false);
    }
  };

  const openPaymentPdf = (p: SupplierPayment) => {
    const ref = p.transactionRef || `PAY-${p.id.slice(-8).toUpperCase()}`;
    const company = p.supplier?.name || "مورد";
    setPdfPreview({
      title: "إيصال دفع مورد · Supplier Payment Receipt",
      filename: `${ref}.pdf`,
      payload: {
        title: "Supplier Payment Receipt",
        reference: ref,
        date: new Date(p.createdAt).toLocaleString("en-GB"),
        partyLabel: "Supplier / Company",
        partyName: company,
        meta: [
          {
            label: "Payment type",
            value: p.method === "CASH" ? "Cash" : "Bank transfer",
          },
          { label: "Bank name", value: p.bankName || "—" },
          {
            label: "Bank country",
            value: p.bankCountry || p.supplier?.country || "—",
          },
        ],
        items: [
          {
            name: `Payment to ${company}`,
            quantity: 1,
            unitPrice: Number(p.amount),
            total: Number(p.amount),
          },
        ],
        totalLabel: "Amount paid",
        totalAmount: Number(p.amount),
        notes: p.notes || undefined,
      },
    });
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
                إجمالي المدفوعات: {formatCurrency(paymentTotal)}
              </p>
            </div>
            <Button type="button" onClick={() => setOpenForm(true)}>
              <Plus className="h-4 w-4" />
              تسجيل دفعة
            </Button>
          </CardHeader>
          <CardContent className="table-scroll overflow-x-auto p-0">
            {loadingPayments ? (
              <p className="p-5 text-sm text-slate-500">جاري التحميل...</p>
            ) : (
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium">الشركة</th>
                    <th className="px-4 py-3 text-right font-medium">المبلغ</th>
                    <th className="px-4 py-3 text-right font-medium">النوع</th>
                    <th className="px-4 py-3 text-right font-medium">البنك</th>
                    <th className="px-4 py-3 text-right font-medium">الدولة</th>
                    <th className="px-4 py-3 text-right font-medium">التاريخ</th>
                    <th className="px-4 py-3 text-right font-medium">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium">
                        {p.supplier?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-semibold text-primary">
                        {formatCurrency(p.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={p.method === "CASH" ? "default" : "indigo"}>
                          {p.method === "CASH" ? "نقدي" : "تحويل بنكي"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{p.bankName || "—"}</td>
                      <td className="px-4 py-3">
                        {p.bankCountry || p.supplier?.country || "—"}
                      </td>
                      <td className="px-4 py-3">{formatDate(p.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openPaymentPdf(p)}
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
            {!loadingPayments && payments.length === 0 && (
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
              {invoices.length} فاتورة
            </p>
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
                  {invoices.map((inv: IssuedInvoice) => (
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
            {!loadingInvoices && invoices.length === 0 && (
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
          <form onSubmit={createPayment} className="grid gap-3">
            <Input
              required
              placeholder="اسم شركة المورد"
              value={form.supplierName}
              onChange={(e) =>
                setForm({ ...form, supplierName: e.target.value })
              }
            />
            <Input
              required
              type="number"
              min="0"
              step="0.01"
              placeholder="المبلغ"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
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
            <Button type="submit" disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ الدفعة"}
            </Button>
          </form>
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
    </div>
  );
}
