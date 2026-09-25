"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Package,
  Boxes,
  Pill,
  AlertTriangle,
  Search,
  Plus,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { useAuthStore, canDeleteRecords } from "@/lib/stores/auth-store";
import { formatCurrency, formatDate, daysUntilExpiry, isExpired, isNearExpiry } from "@/lib/utils";

type BatchRow = {
  id: string;
  productId: string;
  productName: string;
  category: "HUMAN" | "VETERINARY";
  batchNumber: string;
  quantity: number;
  costPrice: number;
  expiryDate: string;
  location: "WAREHOUSE" | "PHARMACY";
  manufacturer: string;
  country: string;
  unitType: string;
};

type RawBatch = {
  id?: string;
  batchNumber?: string | null;
  quantity?: number | string | null;
  costPrice?: number | string | null;
  expiryDate?: string | null;
  warehouseId?: string | null;
};

type RawProduct = {
  id?: string;
  name?: string | null;
  category?: string | null;
  unitType?: string | null;
  manufacturer?: string | null;
  country?: string | null;
  costPrice?: number | string | null;
  availableQty?: number | string | null;
  batchId?: string | null;
  batchNumber?: string | null;
  expiryDate?: string | null;
  batches?: RawBatch[] | null;
};

type RawDemoBatch = Partial<BatchRow> & {
  quantity?: number | string | null;
  costPrice?: number | string | null;
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function hasValidDate(value: string | null | undefined): value is string {
  return !!value && !Number.isNaN(new Date(value).getTime());
}

function toCategory(value: unknown): BatchRow["category"] {
  return value === "VETERINARY" ? "VETERINARY" : "HUMAN";
}

function normalizeDemoBatch(b: RawDemoBatch, idx: number): BatchRow {
  return {
    id: b.id ?? `batch-${idx}`,
    productId: b.productId ?? b.id ?? `product-${idx}`,
    productName: b.productName ?? "منتج",
    category: toCategory(b.category),
    batchNumber: b.batchNumber ?? "-",
    quantity: toNumber(b.quantity),
    costPrice: toNumber(b.costPrice),
    expiryDate: b.expiryDate ?? "",
    location: b.location === "PHARMACY" ? "PHARMACY" : "WAREHOUSE",
    manufacturer: b.manufacturer ?? "",
    country: b.country ?? "",
    unitType: b.unitType ?? "",
  };
}

async function fetchWarehouse(): Promise<BatchRow[]> {
  let res: Response;
  let data: { error?: string; batches?: unknown; products?: unknown } | null;
  try {
    res = await fetch("/api/products?location=all");
    data = await res.json().catch(() => null);
  } catch {
    throw new Error("تعذر الاتصال بالخادم — تحقق من الاتصال بالإنترنت");
  }
  if (!res.ok) {
    throw new Error(data?.error || "فشل تحميل بيانات المستودع");
  }

  if (Array.isArray(data?.batches)) {
    return (data.batches as RawDemoBatch[]).map(normalizeDemoBatch);
  }

  const products: RawProduct[] = Array.isArray(data?.products) ? data.products : [];
  const batches: BatchRow[] = [];

  for (const [idx, p] of products.entries()) {
    if (!p) continue;
    const productId = p.id ?? `product-${idx}`;
    const base = {
      productId,
      productName: p.name ?? "منتج",
      category: toCategory(p.category),
      manufacturer: p.manufacturer ?? "",
      country: p.country ?? "",
      unitType: p.unitType ?? "",
    };

    const productBatches = Array.isArray(p.batches) ? p.batches : [];
    if (productBatches.length > 0) {
      for (const [bIdx, b] of productBatches.entries()) {
        if (!b) continue;
        batches.push({
          ...base,
          id: b.id ?? `${productId}-batch-${bIdx}`,
          batchNumber: b.batchNumber ?? "-",
          quantity: toNumber(b.quantity),
          costPrice: toNumber(b.costPrice ?? p.costPrice),
          expiryDate: b.expiryDate ?? "",
          location: b.warehouseId ? "WAREHOUSE" : "PHARMACY",
        });
      }
    } else {
      // Products whose stock is fully sold/transferred have no in-stock batches
      batches.push({
        ...base,
        id: p.batchId ?? productId,
        batchNumber: p.batchNumber ?? "-",
        quantity: toNumber(p.availableQty),
        costPrice: toNumber(p.costPrice),
        expiryDate: p.expiryDate ?? "",
        location: "WAREHOUSE",
      });
    }
  }
  return batches;
}

export default function WarehousePage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const allowDelete = canDeleteRecords(user?.role);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"ALL" | "HUMAN" | "VETERINARY">("ALL");
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    productId: string;
    productName: string;
  } | null>(null);
  const [form, setForm] = useState({
    name: "",
    category: "HUMAN",
    unitType: "BOX",
    defaultPrice: "",
    costPrice: "",
    manufacturer: "",
    country: "",
    batchNumber: "",
    quantity: "",
    expiryDate: "",
  });
  const [msg, setMsg] = useState<string | null>(null);

  const {
    data: batchData,
    refetch,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["warehouse"],
    queryFn: fetchWarehouse,
  });
  const batches = useMemo(
    () => (Array.isArray(batchData) ? batchData : []),
    [batchData]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return batches.filter((b) => {
      const matchCat = category === "ALL" || b?.category === category;
      const matchQ =
        !q ||
        (b?.productName ?? "").toLowerCase().includes(q) ||
        (b?.batchNumber ?? "").toLowerCase().includes(q) ||
        (b?.manufacturer ?? "").toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [batches, category, query]);

  const alerts = useMemo(() => {
    const low = filtered.filter((b) => (b?.quantity ?? 0) <= 10);
    const expiry = filtered.filter(
      (b) =>
        hasValidDate(b?.expiryDate) &&
        (isExpired(b.expiryDate) || isNearExpiry(b.expiryDate))
    );
    return { low, expiry };
  }, [filtered]);

  const confirmDeleteProduct = async () => {
    if (!deleteTarget) return;
    const res = await fetch(
      `/api/products?id=${encodeURIComponent(deleteTarget.productId)}`,
      { method: "DELETE" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(data.error || "فشل حذف المنتج");
      return;
    }
    setMsg(`تم حذف المنتج: ${deleteTarget.productName}`);
    setDeleteTarget(null);
    void queryClient.invalidateQueries({ queryKey: ["warehouse"] });
    void refetch();
  };

  const submitProduct = async () => {
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        category: form.category,
        unitType: form.unitType,
        defaultPrice: Number(form.defaultPrice),
        costPrice: Number(form.costPrice),
        manufacturer: form.manufacturer,
        country: form.country,
        batch: {
          batchNumber: form.batchNumber,
          quantity: Number(form.quantity),
          costPrice: Number(form.costPrice),
          expiryDate: form.expiryDate,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    setMsg(data?.message ?? data?.error ?? "تمت إضافة الصنف");
    setOpen(false);
    void refetch();
  };

  return (
    <AppShell
      title="إدارة المستودع"
      subtitle="الدفعات، الصلاحية، التصنيف البشري والبيطري"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              إضافة صنف
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إضافة منتج ودفعة جديدة</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <Input
                placeholder="اسم المنتج"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  <option value="HUMAN">بشري</option>
                  <option value="VETERINARY">بيطري</option>
                </select>
                <select
                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
                  value={form.unitType}
                  onChange={(e) => setForm({ ...form, unitType: e.target.value })}
                >
                  {["BOX", "CARTON", "BOTTLE", "INJECTABLE", "VIAL", "ML", "STRIP", "CATHETER", "DRIP"].map(
                    (u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  placeholder="سعر التكلفة"
                  value={form.costPrice}
                  onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                />
                <Input
                  type="number"
                  placeholder="سعر البيع"
                  value={form.defaultPrice}
                  onChange={(e) => setForm({ ...form, defaultPrice: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="الشركة"
                  value={form.manufacturer}
                  onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
                />
                <Input
                  placeholder="بلد المنشأ"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                />
              </div>
              <Input
                placeholder="رقم الدفعة"
                value={form.batchNumber}
                onChange={(e) => setForm({ ...form, batchNumber: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  placeholder="الكمية"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                />
                <Input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                />
              </div>
              <Button onClick={submitProduct} disabled={!form.name || !form.batchNumber}>
                حفظ
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-slate-500">إجمالي الدفعات</p>
              <p className="text-2xl font-bold">{filtered.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <div className="rounded-xl bg-warning/10 p-3 text-warning">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-slate-500">مخزون منخفض</p>
              <p className="text-2xl font-bold">{alerts.low.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-5">
            <div className="rounded-xl bg-danger/10 p-3 text-danger">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-slate-500">قرب / منتهي الصلاحية</p>
              <p className="text-2xl font-bold">{alerts.expiry.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 flex-1 sm:min-w-[240px]">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pr-10"
            placeholder="بحث في المستودع..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {(["ALL", "HUMAN", "VETERINARY"] as const).map((c) => (
          <Button
            key={c}
            variant={category === c ? "default" : "outline"}
            onClick={() => setCategory(c)}
          >
            {c === "ALL" ? "الكل" : c === "HUMAN" ? "بشري" : "بيطري"}
          </Button>
        ))}
      </div>

      {msg && (
        <p className="mb-4 rounded-lg bg-success/10 px-3 py-2 text-sm text-emerald-700">
          {msg}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            سجل الدفعات والمخزون
          </CardTitle>
        </CardHeader>
        <CardContent className="table-scroll overflow-x-auto p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-slate-500">جاري التحميل...</p>
          ) : isError ? (
            <p className="p-6 text-sm text-red-700">
              {error instanceof Error ? error.message : "فشل تحميل بيانات المستودع"}
            </p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-right font-medium">المنتج</th>
                  <th className="px-4 py-3 text-right font-medium">التصنيف</th>
                  <th className="px-4 py-3 text-right font-medium">الدفعة</th>
                  <th className="px-4 py-3 text-right font-medium">الكمية</th>
                  <th className="px-4 py-3 text-right font-medium">التكلفة</th>
                  <th className="px-4 py-3 text-right font-medium">الصلاحية</th>
                  <th className="px-4 py-3 text-right font-medium">الموقع</th>
                  {allowDelete && (
                    <th className="px-4 py-3 text-right font-medium">إجراء</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((b, idx) => {
                  const validExpiry = hasValidDate(b.expiryDate);
                  const days = validExpiry ? daysUntilExpiry(b.expiryDate) : 0;
                  const expired = validExpiry && isExpired(b.expiryDate);
                  const near = validExpiry && isNearExpiry(b.expiryDate);
                  return (
                    <motion.tr
                      key={b.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      className="border-t border-slate-100"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {b.category === "HUMAN" ? (
                            <Pill className="h-4 w-4 text-primary" />
                          ) : (
                            <Package className="h-4 w-4 text-warning" />
                          )}
                          <div>
                            <p className="font-medium">{b.productName}</p>
                            <p className="text-xs text-slate-500">
                              {b.manufacturer} · {b.country}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={b.category === "HUMAN" ? "default" : "warning"}>
                          {b.category === "HUMAN" ? "بشري" : "بيطري"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{b.batchNumber}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            b.quantity <= 10 ? "font-bold text-danger" : "font-semibold"
                          }
                        >
                          {b.quantity}
                        </span>{" "}
                        <span className="text-xs text-slate-400">{b.unitType}</span>
                      </td>
                      <td className="px-4 py-3">{formatCurrency(b.costPrice)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span>{validExpiry ? formatDate(b.expiryDate) : "-"}</span>
                          {(expired || near) && (
                            <Badge variant={expired ? "danger" : "warning"}>
                              <AlertTriangle className="h-3 w-3" />
                              {expired ? "منتهي" : `${days} يوم`}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">
                          {b.location === "WAREHOUSE" ? "مستودع" : "صيدلية"}
                        </Badge>
                      </td>
                      {allowDelete && (
                        <td className="px-4 py-3">
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() =>
                              setDeleteTarget({
                                productId: b.productId,
                                productName: b.productName,
                              })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            حذف
                          </Button>
                        </td>
                      )}
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={confirmDeleteProduct}
        title="حذف منتج"
      />
    </AppShell>
  );
}
