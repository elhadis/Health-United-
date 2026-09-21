"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Clock,
  Send,
  ClipboardList,
  CheckCircle2,
  Truck,
  XCircle,
  ChevronDown,
  Search,
  Printer,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { PrintBrandHeader } from "@/components/branding/print-brand-header";
import { cn, formatDate, isNearExpiry } from "@/lib/utils";
import { useAuthStore, canDeleteRecords } from "@/lib/stores/auth-store";

type OrderRow = {
  id: string;
  orderNumber: string;
  type: string;
  status: "PENDING" | "APPROVED" | "DISPATCHED" | "CONFIRMED" | "REJECTED";
  notes?: string;
  createdAt: string;
  items: { productName: string; quantity: number; unitType: string }[];
};

type ProductOption = {
  id: string;
  name: string;
  sku?: string;
  unitType: string;
  availableQty: number;
  lowStockThreshold?: number;
  expiryDate?: string;
};

const statusMeta: Record<
  OrderRow["status"],
  { label: string; variant: "warning" | "default" | "indigo" | "success" | "danger"; icon: typeof Clock }
> = {
  PENDING: { label: "قيد الانتظار", variant: "warning", icon: Clock },
  APPROVED: { label: "معتمد", variant: "default", icon: CheckCircle2 },
  DISPATCHED: { label: "تم الإرسال", variant: "indigo", icon: Truck },
  CONFIRMED: { label: "مؤكد من الصيدلية", variant: "success", icon: CheckCircle2 },
  REJECTED: { label: "مرفوض", variant: "danger", icon: XCircle },
};

const nextStatus: Partial<Record<OrderRow["status"], OrderRow["status"]>> = {
  PENDING: "APPROVED",
  APPROVED: "DISPATCHED",
  DISPATCHED: "CONFIRMED",
};

async function fetchOrders() {
  const res = await fetch("/api/orders");
  const data = await res.json();
  return (data.orders ?? []) as OrderRow[];
}

async function fetchProductsForOrder() {
  const res = await fetch("/api/products");
  const data = await res.json();
  return (data.products ?? []) as ProductOption[];
}

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const allowDelete = canDeleteRecords(user?.role);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState("20");
  const [productId, setProductId] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [unitType, setUnitType] = useState("BOTTLE");
  const [productSearch, setProductSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [printOrderId, setPrintOrderId] = useState<string | null>(null);
  const [deleteOrderId, setDeleteOrderId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const comboboxRef = useRef<HTMLDivElement>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["orders"],
    queryFn: fetchOrders,
  });

  const { data: products = [], isFetching: loadingProducts } = useQuery({
    queryKey: ["order-products"],
    queryFn: fetchProductsForOrder,
    enabled: open,
    staleTime: 30_000,
  });

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q)
    );
  }, [products, productSearch]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!comboboxRef.current?.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [dropdownOpen]);

  const resetForm = () => {
    setNotes("");
    setQty("20");
    setProductId(null);
    setProductName("");
    setUnitType("");
    setProductSearch("");
    setDropdownOpen(false);
  };

  const selectProduct = (product: ProductOption) => {
    setProductId(product.id);
    setProductName(product.name);
    setUnitType(product.unitType || "BOX");
    setProductSearch("");
    setDropdownOpen(false);
  };

  const handleDialogChange = (next: boolean) => {
    setOpen(next);
    // Always clear prior selection so the next order starts empty
    resetForm();
  };

  const printOrder = orders.find((o) => o.id === printOrderId);

  const handlePrintOrder = (id: string) => {
    setPrintOrderId(id);
    // Allow React to render the print document before opening the dialog
    requestAnimationFrame(() => {
      setTimeout(() => window.print(), 50);
    });
  };

  const advance = async (id: string, status: OrderRow["status"]) => {
    const next = nextStatus[status];
    if (!next) return;
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("[orders] advance failed:", res.status, data);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (err) {
      console.error("[orders] advance error:", err);
    }
  };

  const reject = async (id: string) => {
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "REJECTED" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("[orders] reject failed:", res.status, data);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    } catch (err) {
      console.error("[orders] reject error:", err);
    }
  };

  const confirmDeleteOrder = async () => {
    if (!deleteOrderId) return;
    const res = await fetch(
      `/api/orders?id=${encodeURIComponent(deleteOrderId)}`,
      { method: "DELETE" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSubmitMsg({
        type: "error",
        text: data.error || "فشل حذف الطلب",
      });
      return;
    }
    setSubmitMsg({ type: "success", text: "تم حذف الطلب بنجاح" });
    setDeleteOrderId(null);
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
  };

  const createOrder = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitMsg(null);

    if (!productId) {
      setSubmitMsg({ type: "error", text: "اختر منتجاً من القائمة" });
      setSubmitting(false);
      return;
    }

    const quantity = Number(qty);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setSubmitMsg({ type: "error", text: "أدخل كمية صحيحة أكبر من صفر" });
      setSubmitting(false);
      return;
    }

    const selectedName = productName.trim();
    const payload = {
      type: "PHARMACY_TO_WAREHOUSE",
      notes,
      pharmacyId: user?.pharmacyId ?? undefined,
      warehouseId: user?.warehouseId ?? undefined,
      requesterId: user?.id ?? undefined,
      items: [
        {
          productId,
          ...(selectedName ? { productName: selectedName } : {}),
          quantity,
          unitType: unitType || "BOX",
        },
      ],
    };

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("[orders] create failed:", res.status, data);
        setSubmitMsg({
          type: "error",
          text: data.error || `فشل إرسال الطلب (${res.status})`,
        });
        return;
      }

      // Optimistic list refresh
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      setOpen(false);
      resetForm();
      setSubmitMsg({
        type: "success",
        text: `تم إنشاء الطلب ${data.order?.orderNumber ?? ""} بنجاح`,
      });
    } catch (err) {
      console.error("[orders] create error:", err);
      setSubmitMsg({
        type: "error",
        text: "تعذر الاتصال بالخادم أثناء إرسال الطلب",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      title="الطلبات والتحويلات"
      subtitle="مسار: قيد الانتظار → معتمد → مُرسل → مؤكد من الصيدلية"
      actions={
        <Dialog open={open} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button>
              <Send className="h-4 w-4" />
              طلب تحويل جديد
            </Button>
          </DialogTrigger>
            <DialogContent className="overflow-visible">
              <DialogHeader>
                <DialogTitle>طلب من الصيدلية إلى المستودع</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div ref={comboboxRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setDropdownOpen((v) => !v)}
                    className={cn(
                      "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-secondary shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      !productName && "text-slate-400"
                    )}
                  >
                    <span className="truncate">
                      {productName || "اختر المنتج من المخزون"}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-slate-400 transition-transform",
                        dropdownOpen && "rotate-180"
                      )}
                    />
                  </button>

                  {dropdownOpen && (
                    <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                      <div className="border-b border-slate-100 p-2">
                        <div className="relative">
                          <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                          <Input
                            autoFocus
                            value={productSearch}
                            onChange={(e) => setProductSearch(e.target.value)}
                            placeholder="ابحث بالاسم أو الرمز..."
                            className="h-9 pr-8"
                          />
                        </div>
                      </div>
                      <ul className="max-h-56 overflow-y-auto py-1">
                        {loadingProducts && (
                          <li className="px-3 py-2 text-sm text-slate-500">
                            جاري تحميل المنتجات...
                          </li>
                        )}
                        {!loadingProducts && filteredProducts.length === 0 && (
                          <li className="px-3 py-2 text-sm text-slate-500">
                            لا توجد منتجات مطابقة
                          </li>
                        )}
                        {filteredProducts.map((product) => {
                          const threshold = product.lowStockThreshold ?? 10;
                          const isLow =
                            (product.availableQty ?? 0) <= threshold;
                          const near =
                            !!product.expiryDate &&
                            isNearExpiry(product.expiryDate);
                          const selected = product.id === productId;
                          return (
                            <li key={product.id}>
                              <button
                                type="button"
                                onClick={() => selectProduct(product)}
                                className={cn(
                                  "flex w-full flex-col gap-1.5 px-3 py-2.5 text-right transition-colors hover:bg-slate-50",
                                  selected && "bg-primary/5"
                                )}
                              >
                                <span className="text-sm font-medium text-secondary">
                                  {product.name}
                                </span>
                                <span className="flex flex-wrap items-center gap-1.5">
                                  <Badge variant="outline">
                                    متبقي {product.availableQty ?? 0}
                                  </Badge>
                                  {isLow && (
                                    <Badge variant="warning">كمية منخفضة</Badge>
                                  )}
                                  {near && (
                                    <Badge variant="danger">قريب الانتهاء</Badge>
                                  )}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
                <Input
                  type="number"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="الكمية"
                />
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ملاحظات"
                />
                <Button
                  onClick={createOrder}
                  disabled={submitting || !productId}
                >
                  {submitting ? "جاري الإرسال..." : "إرسال الطلب"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
      }
    >
      {submitMsg && (
        <p
          className={`mb-4 rounded-lg px-3 py-2 text-sm no-print ${
            submitMsg.type === "success"
              ? "bg-success/10 text-emerald-700"
              : "bg-danger/10 text-red-700"
          }`}
        >
          {submitMsg.text}
        </p>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 md:grid-cols-4 no-print">
        {(["PENDING", "APPROVED", "DISPATCHED", "CONFIRMED"] as const).map((s) => {
          const meta = statusMeta[s];
          const Icon = meta.icon;
          const count = orders.filter((o) => o.status === s).length;
          return (
            <Card key={s}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="rounded-lg bg-slate-100 p-2">
                  <Icon className="h-4 w-4 text-secondary" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">{meta.label}</p>
                  <p className="text-xl font-bold">{count}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="space-y-4 no-print">
        {isLoading && <p className="text-sm text-slate-500">جاري التحميل...</p>}
        {orders.map((order, idx) => {
          const meta = statusMeta[order.status];
          const Icon = meta.icon;
          return (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.04 }}
            >
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ClipboardList className="h-4 w-4 text-primary" />
                      {order.orderNumber}
                    </CardTitle>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatDate(order.createdAt)}
                      {order.notes ? ` · ${order.notes}` : ""}
                    </p>
                  </div>
                  <Badge variant={meta.variant}>
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {order.items.map((item, i) => (
                      <Badge key={i} variant="outline">
                        {item.productName} × {item.quantity} ({item.unitType})
                      </Badge>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {nextStatus[order.status] && (
                      <Button onClick={() => advance(order.id, order.status)}>
                        <Send className="h-4 w-4" />
                        ترحيل إلى: {statusMeta[nextStatus[order.status]!].label}
                      </Button>
                    )}
                    {order.status === "PENDING" && (
                      <Button variant="danger" onClick={() => reject(order.id)}>
                        <XCircle className="h-4 w-4" />
                        رفض
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => handlePrintOrder(order.id)}>
                      <Printer className="h-4 w-4" />
                      طباعة التحويل
                    </Button>
                    {allowDelete && (
                      <Button
                        variant="danger"
                        onClick={() => setDeleteOrderId(order.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        حذف
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Clock className="h-3.5 w-3.5" />
                    النوع:{" "}
                    {order.type === "PHARMACY_TO_WAREHOUSE"
                      ? "صيدلية ← مستودع"
                      : order.type === "WAREHOUSE_TO_ADMIN"
                        ? "مستودع ← إدارة"
                        : "طلب شراء"}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {printOrder && (
        <div className="print-only print-document rounded-xl border border-slate-200 bg-white p-6">
          <PrintBrandHeader documentTitle="تقرير تحويل مخزون" />
          <div className="mb-4 space-y-1 text-sm text-slate-600">
            <p>
              رقم الطلب: <span className="font-semibold text-secondary">{printOrder.orderNumber}</span>
            </p>
            <p>التاريخ: {formatDate(printOrder.createdAt)}</p>
            <p>الحالة: {statusMeta[printOrder.status].label}</p>
            {printOrder.notes && <p>ملاحظات: {printOrder.notes}</p>}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-right text-slate-500">
                <th className="py-2 font-medium">المنتج</th>
                <th className="py-2 font-medium">الكمية</th>
                <th className="py-2 font-medium">الوحدة</th>
              </tr>
            </thead>
            <tbody>
              {printOrder.items.map((item, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2">{item.productName}</td>
                  <td className="py-2">{item.quantity}</td>
                  <td className="py-2">{item.unitType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!deleteOrderId}
        onOpenChange={(open) => {
          if (!open) setDeleteOrderId(null);
        }}
        onConfirm={confirmDeleteOrder}
        title="حذف طلب / تحويل"
      />
    </AppShell>
  );
}
