"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Package,
  Store,
  Download,
  Share2,
  MessageCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  downloadTransferPdf,
  getTransferPdfBlob,
  sharePdfFile,
  shareViaWhatsApp,
  type TransferPdfPayload,
} from "@/lib/pdf/official-pdf";
import { COMPANY_NAME_AR } from "@/lib/branding";
import { formatDate } from "@/lib/utils";

export type TransferOrderRow = {
  id: string;
  orderNumber: string;
  type: string;
  status: "PENDING" | "APPROVED" | "DISPATCHED" | "CONFIRMED" | "REJECTED";
  notes?: string;
  createdAt: string;
  approvedAt?: string | null;
  dispatchedAt?: string | null;
  pharmacyName?: string | null;
  warehouseName?: string | null;
  requesterName?: string | null;
  items: {
    productId?: string | null;
    productName: string;
    quantity: number;
    unitType: string;
  }[];
};

type FilterKey = "today" | "week" | "month" | "custom";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function getBounds(filter: FilterKey, customFrom: string, customTo: string) {
  const now = new Date();
  if (filter === "today") {
    return { from: startOfDay(now), to: endOfDay(now) };
  }
  if (filter === "week") {
    const from = startOfDay(now);
    from.setDate(from.getDate() - 6);
    return { from, to: endOfDay(now) };
  }
  if (filter === "month") {
    const from = startOfDay(now);
    from.setDate(1);
    return { from, to: endOfDay(now) };
  }
  const from = customFrom
    ? startOfDay(new Date(customFrom))
    : startOfDay(now);
  const to = customTo ? endOfDay(new Date(customTo)) : endOfDay(now);
  return { from, to };
}

function filterLabel(filter: FilterKey) {
  if (filter === "today") return "اليوم";
  if (filter === "week") return "هذا الأسبوع";
  if (filter === "month") return "هذا الشهر";
  return "نطاق مخصص";
}

function statusLabel(status: TransferOrderRow["status"]) {
  if (status === "APPROVED") return "معتمد";
  if (status === "DISPATCHED") return "مُرسل";
  if (status === "CONFIRMED") return "مؤكد";
  if (status === "PENDING") return "قيد الانتظار";
  return "مرفوض";
}

export function TransferAnalyticsTab({
  orders,
}: {
  orders: TransferOrderRow[];
}) {
  const [filter, setFilter] = useState<FilterKey>("week");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [busy, setBusy] = useState(false);

  const bounds = useMemo(
    () => getBounds(filter, customFrom, customTo),
    [filter, customFrom, customTo]
  );

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const t = new Date(o.approvedAt || o.createdAt).getTime();
      return t >= bounds.from.getTime() && t <= bounds.to.getTime();
    });
  }, [orders, bounds]);

  const approvedOrders = useMemo(
    () =>
      filtered.filter((o) =>
        ["APPROVED", "DISPATCHED", "CONFIRMED"].includes(o.status)
      ),
    [filtered]
  );

  const dispatchedOrders = useMemo(
    () =>
      filtered.filter((o) =>
        ["DISPATCHED", "CONFIRMED"].includes(o.status)
      ),
    [filtered]
  );

  const pharmacyTransfers = useMemo(
    () =>
      filtered.filter(
        (o) =>
          o.type === "PHARMACY_TO_WAREHOUSE" &&
          ["APPROVED", "DISPATCHED", "CONFIRMED"].includes(o.status)
      ),
    [filtered]
  );

  const dispatchedQty = useMemo(
    () =>
      dispatchedOrders.reduce(
        (sum, o) =>
          sum + o.items.reduce((s, item) => s + Number(item.quantity || 0), 0),
        0
      ),
    [dispatchedOrders]
  );

  const lineItems = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; unitType: string }>();
    for (const order of approvedOrders) {
      for (const item of order.items) {
        const key = `${item.productName}::${item.unitType}`;
        const prev = map.get(key);
        if (prev) {
          prev.quantity += item.quantity;
        } else {
          map.set(key, {
            name: item.productName,
            quantity: item.quantity,
            unitType: item.unitType,
          });
        }
      }
    }
    return Array.from(map.values());
  }, [approvedOrders]);

  const buildPayload = (): TransferPdfPayload => ({
    title: "Transfer Analytics Report",
    reference: `TRF-${Date.now().toString(36).toUpperCase()}`,
    date: new Date().toLocaleDateString("en-GB"),
    partyLabel: "Company",
    partyName: COMPANY_NAME_AR,
    meta: [
      { label: "Period", value: filterLabel(filter) },
      {
        label: "From",
        value: bounds.from.toLocaleDateString("en-GB"),
      },
      {
        label: "To",
        value: bounds.to.toLocaleDateString("en-GB"),
      },
    ],
    summaryLines: [
      `Approved orders: ${approvedOrders.length}`,
      `Dispatched quantities: ${dispatchedQty}`,
      `Cashier / Pharmacy transfers: ${pharmacyTransfers.length}`,
    ],
    items:
      lineItems.length > 0
        ? lineItems
        : [{ name: "No approved transfers in period", quantity: 0, unitType: "-" }],
    notes: `Generated for warehouse transfer analytics — ${COMPANY_NAME_AR}`,
  });

  const shareText = () =>
    [
      COMPANY_NAME_AR,
      "تقرير التحويلات",
      `الفترة: ${filterLabel(filter)}`,
      `الطلبات المعتمدة: ${approvedOrders.length}`,
      `الكميات المُرسلة: ${dispatchedQty}`,
      `تحويلات الصيدلية/الكاشير: ${pharmacyTransfers.length}`,
    ].join("\n");

  const handleExportPdf = async () => {
    setBusy(true);
    try {
      const payload = buildPayload();
      await downloadTransferPdf(
        payload,
        `transfer-report-${payload.reference}.pdf`
      );
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    setBusy(true);
    try {
      const payload = buildPayload();
      const filename = `transfer-report-${payload.reference}.pdf`;
      const blob = await getTransferPdfBlob(payload);
      const shared = await sharePdfFile(
        blob,
        filename,
        "تقرير التحويلات",
        shareText()
      );
      if (!shared) {
        shareViaWhatsApp(shareText());
      }
    } catch {
      shareViaWhatsApp(shareText());
    } finally {
      setBusy(false);
    }
  };

  const handleWhatsApp = () => {
    shareViaWhatsApp(shareText());
  };

  return (
    <div className="space-y-4 no-print">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["today", "اليوم"],
            ["week", "هذا الأسبوع"],
            ["month", "هذا الشهر"],
            ["custom", "نطاق مخصص"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={filter === key ? "default" : "outline"}
            onClick={() => setFilter(key)}
          >
            {label}
          </Button>
        ))}
        <div className="ms-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={handleExportPdf}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            تصدير PDF
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={handleShare}>
            <Share2 className="h-4 w-4" />
            مشاركة
          </Button>
          <Button size="sm" variant="outline" onClick={handleWhatsApp}>
            <MessageCircle className="h-4 w-4" />
            واتساب
          </Button>
        </div>
      </div>

      {filter === "custom" && (
        <div className="flex flex-wrap gap-2">
          <Input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="max-w-[180px]"
          />
          <Input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="max-w-[180px]"
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <Card className="transition-all hover:shadow-md hover:ring-2 hover:ring-primary/20">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-emerald-50 p-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            </div>
            <div>
              <p className="text-xs text-slate-500">إجمالي الطلبات المعتمدة</p>
              <p className="text-xl font-bold">{approvedOrders.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="transition-all hover:shadow-md hover:ring-2 hover:ring-primary/20">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-indigo-50 p-2">
              <Package className="h-4 w-4 text-indigo-700" />
            </div>
            <div>
              <p className="text-xs text-slate-500">الكميات المُرسلة</p>
              <p className="text-xl font-bold">{dispatchedQty}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="transition-all hover:shadow-md hover:ring-2 hover:ring-primary/20">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-amber-50 p-2">
              <Store className="h-4 w-4 text-amber-700" />
            </div>
            <div>
              <p className="text-xs text-slate-500">تحويلات الصيدلية / الكاشير</p>
              <p className="text-xl font-bold">{pharmacyTransfers.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            تفاصيل التحويلات — {filterLabel(filter)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {approvedOrders.length === 0 && (
            <p className="text-sm text-slate-500">لا توجد تحويلات معتمدة في هذه الفترة</p>
          )}
          {approvedOrders.map((order) => (
            <div
              key={order.id}
              className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3 sm:flex-row sm:items-start sm:justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-secondary">
                  {order.orderNumber}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatDate(order.approvedAt || order.createdAt)}
                  {order.pharmacyName ? ` · ${order.pharmacyName}` : ""}
                  {order.requesterName ? ` · ${order.requesterName}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {order.items.map((item, i) => (
                    <Badge key={i} variant="outline">
                      {item.productName} × {item.quantity} ({item.unitType})
                    </Badge>
                  ))}
                </div>
              </div>
              <Badge variant="default">{statusLabel(order.status)}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
