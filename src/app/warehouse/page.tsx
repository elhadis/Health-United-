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
  Pencil,
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

const UNIT_OPTIONS = [
  "BOX",
  "CARTON",
  "BOTTLE",
  "INJECTABLE",
  "VIAL",
  "ML",
  "STRIP",
  "CATHETER",
  "DRIP",
];

type BatchRow = {
  id: string;
  batchId?: string;
  productId: string;
  productName: string;
  category: "HUMAN" | "VETERINARY";
  batchNumber: string;
  quantity: number;
  costPrice: number;
  defaultPrice?: number;
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
  pharmacyId?: string | null;
};

type RawProduct = {
  id?: string;
  name?: string | null;
  category?: string | null;
  unitType?: string | null;
  manufacturer?: string | null;
  country?: string | null;
  costPrice?: number | string | null;
  defaultPrice?: number | string | null;
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
  let data: { error?: string; mode?: string; batches?: unknown; products?: unknown } | null;
  try {
    res = await fetch("/api/products?location=all&includeEmpty=1");
    data = await res.json().catch(() => null);
  } catch {
    throw new Error("تعذر الاتصال بالخادم — تحقق من الاتصال بالإنترنت");
  }
  if (!res.ok) {
    throw new Error(data?.error || "فشل تحميل بيانات المستودع");
  }
  // Demo rows have fake ids and cannot be edited or deleted; treat as a transient DB outage.
  if (data?.mode === "demo") {
    throw new Error("تعذر الاتصال بقاعدة البيانات — جاري إعادة المحاولة...");
  }

  if (Array.isArray(data?.batches)) {
    return (data.batches as RawDemoBatch[])
      .map(normalizeDemoBatch)
      .filter((b) => b.location !== "PHARMACY");
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
      defaultPrice: toNumber(p.defaultPrice),
    };

    // Stock already transferred to a pharmacy belongs to that pharmacy, not the warehouse table.
    const warehouseBatches = (Array.isArray(p.batches) ? p.batches : []).filter(
      (b): b is RawBatch => !!b && !b.pharmacyId
    );
    const inStock = warehouseBatches.filter((b) => toNumber(b.quantity) > 0);
    // Fully depleted products keep one row backed by their latest empty batch so it stays editable.
    const productBatches =
      inStock.length > 0 ? inStock : warehouseBatches.slice(-1);
    if (productBatches.length > 0) {
      for (const [bIdx, b] of productBatches.entries()) {
        batches.push({
          ...base,
          id: b.id ?? `${productId}-batch-${bIdx}`,
          batchId: b.id ?? undefined,
          batchNumber: b.batchNumber ?? "-",
          quantity: toNumber(b.quantity),
          costPrice: toNumber(b.costPrice ?? p.costPrice),
          expiryDate: b.expiryDate ?? "",
          location: "WAREHOUSE",
        });
      }
    } else {
      // Products whose warehouse stock is fully sold/transferred: one zero-balance row
      batches.push({
        ...base,
        id: productId,
        batchNumber: "-",
        quantity: 0,
        costPrice: toNumber(p.costPrice),
        expiryDate: "",
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
  const allowEdit = user?.role === "ADMIN" || user?.role === "ADMINISTRATOR";
  const showActions = allowEdit || allowDelete;
  const [editRow, setEditRow] = useState<BatchRow | null>(null);
  const [editForm, setEditForm] = useState({
    quantity: "",
    expiryDate: "",
    batchNumber: "",
    costPrice: "",
    defaultPrice: "",
    category: "HUMAN",
    unitType: "BOX",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"ALL" | "HUMAN" | "VETERINARY">("ALL");
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    rowId: string;
    batchId?: string;
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
    retry: 3,
    retryDelay: (attempt) => Math.min(1500 * (attempt + 1), 5000),
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
    const target = deleteTarget;
    const url = target.batchId
      ? `/api/products?batchId=${encodeURIComponent(target.batchId)}`
      : `/api/products?id=${encodeURIComponent(target.productId)}`;
    let data: { error?: string } = {};
    try {
      const res = await fetch(url, { method: "DELETE" });
      data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data?.error || "فشل حذف المنتج");
        return;
      }
    } catch {
      setMsg("تعذر الاتصال بالخادم");
      return;
    }
    queryClient.setQueryData<BatchRow[]>(["warehouse"], (prev) =>
      (prev ?? []).filter((row) =>
        target.batchId ? row.id !== target.rowId : row.productId !== target.productId
      )
    );
    setMsg(`تم حذف المنتج: ${target.productName}`);
    setDeleteTarget(null);
    void queryClient.invalidateQueries({ queryKey: ["warehouse"] });
    void queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const startEdit = (row: BatchRow) => {
    setEditError(null);
    setEditRow(row);
    setEditForm({
      quantity: String(row.quantity ?? 0),
      expiryDate: hasValidDate(row.expiryDate) ? row.expiryDate.slice(0, 10) : "",
      batchNumber: row.batchNumber && row.batchNumber !== "-" ? row.batchNumber : "",
      costPrice: String(row.costPrice ?? 0),
      defaultPrice: String(row.defaultPrice ?? 0),
      category: row.category ?? "HUMAN",
      unitType: row.unitType || "BOX",
    });
  };

  const saveEdit = async () => {
    const row = editRow;
    if (!row || savingEdit) return;
    setEditError(null);

    const qtyText = editForm.quantity.trim();
    const quantity = Number.parseInt(qtyText, 10);
    if (!/^\d+$/.test(qtyText) || !Number.isInteger(quantity)) {
      setEditError("الكمية يجب أن تكون رقماً صحيحاً غير سالب");
      return;
    }
    const parsePrice = (text: string) => {
      if (text.trim() === "") return undefined;
      const n = Number.parseFloat(text);
      return Number.isFinite(n) && n >= 0 ? n : NaN;
    };
    const costPrice = parsePrice(editForm.costPrice);
    const sellingPrice = parsePrice(editForm.defaultPrice);
    if (Number.isNaN(costPrice)) {
      setEditError("سعر التكلفة غير صالح");
      return;
    }
    if (Number.isNaN(sellingPrice)) {
      setEditError("سعر البيع غير صالح");
      return;
    }
    let expiryDate: string | undefined;
    if (editForm.expiryDate) {
      const d = new Date(`${editForm.expiryDate}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime())) {
        setEditError("تاريخ الصلاحية غير صالح");
        return;
      }
      expiryDate = d.toISOString();
    }

    const payload = {
      productId: row.productId,
      quantity,
      expiryDate,
      batchNumber: editForm.batchNumber.trim() || undefined,
      costPrice,
      sellingPrice,
      category: String(editForm.category),
      unitType: String(editForm.unitType),
    };

    setSavingEdit(true);
    try {
      const res = await fetch(
        row.batchId
          ? `/api/batches/${encodeURIComponent(row.batchId)}`
          : "/api/products",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(data?.error || `فشل حفظ التعديلات (HTTP ${res.status})`);
        return;
      }
      const product = data?.product ?? {};
      const batch = data?.batch ?? {};
      queryClient.setQueryData<BatchRow[]>(["warehouse"], (prev) =>
        (prev ?? []).map((r) => {
          if (r.productId !== row.productId) return r;
          const productFields = {
            category: toCategory(product.category ?? editForm.category),
            unitType: product.unitType ?? editForm.unitType,
            defaultPrice: toNumber(product.defaultPrice ?? sellingPrice ?? r.defaultPrice),
          };
          if (r.id !== row.id) return { ...r, ...productFields };
          return {
            ...r,
            ...productFields,
            id: batch.id ?? r.id,
            batchId: batch.id ?? r.batchId,
            batchNumber: batch.batchNumber ?? r.batchNumber,
            quantity: toNumber(batch.quantity ?? quantity),
            costPrice: toNumber(batch.costPrice ?? costPrice ?? r.costPrice),
            expiryDate: batch.expiryDate ?? r.expiryDate,
          };
        })
      );
      setMsg(`تم حفظ تعديلات ${row.productName}`);
      setEditRow(null);
      void queryClient.invalidateQueries({ queryKey: ["warehouse"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch {
      setEditError("تعذر الاتصال بالخادم — تحقق من الإنترنت وحاول مجدداً");
    } finally {
      setSavingEdit(false);
    }
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
                  {UNIT_OPTIONS.map(
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
                  {showActions && (
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
                      {showActions && (
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {allowEdit && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => startEdit(b)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                تعديل
                              </Button>
                            )}
                            {allowDelete && (
                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                onClick={() =>
                                  setDeleteTarget({
                                    rowId: b.id,
                                    batchId: b.batchId,
                                    productId: b.productId,
                                    productName: b.productName,
                                  })
                                }
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                حذف
                              </Button>
                            )}
                          </div>
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

      <Dialog
        open={!!editRow}
        onOpenChange={(next) => {
          if (!next && !savingEdit) setEditRow(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل: {editRow?.productName}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs text-slate-500">
                الكمية
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={editForm.quantity}
                  onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-xs text-slate-500">
                تاريخ الصلاحية
                <Input
                  type="date"
                  value={editForm.expiryDate}
                  onChange={(e) => setEditForm({ ...editForm, expiryDate: e.target.value })}
                />
              </label>
            </div>
            <label className="grid gap-1 text-xs text-slate-500">
              رقم الدفعة
              <Input
                value={editForm.batchNumber}
                onChange={(e) => setEditForm({ ...editForm, batchNumber: e.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs text-slate-500">
                سعر التكلفة
                <Input
                  type="number"
                  min={0}
                  value={editForm.costPrice}
                  onChange={(e) => setEditForm({ ...editForm, costPrice: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-xs text-slate-500">
                سعر البيع
                <Input
                  type="number"
                  min={0}
                  value={editForm.defaultPrice}
                  onChange={(e) => setEditForm({ ...editForm, defaultPrice: e.target.value })}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs text-slate-500">
                التصنيف
                <select
                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-secondary"
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                >
                  <option value="HUMAN">بشري</option>
                  <option value="VETERINARY">بيطري</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs text-slate-500">
                نوع/وحدة التغليف
                <select
                  className="h-10 rounded-lg border border-slate-200 px-3 text-sm text-secondary"
                  value={editForm.unitType}
                  onChange={(e) => setEditForm({ ...editForm, unitType: e.target.value })}
                >
                  {UNIT_OPTIONS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-xs text-slate-400">
              التصنيف والوحدة وسعر البيع تنطبق على المنتج بكل دفعاته.
            </p>
            {editError && (
              <p
                role="alert"
                className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-700"
              >
                {editError}
              </p>
            )}
            <Button onClick={() => void saveEdit()} disabled={savingEdit}>
              {savingEdit ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
