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

async function fetchWarehouse() {
  const res = await fetch("/api/products?location=all");
  const data = await res.json();
  if (data.batches) return data.batches as BatchRow[];
  const products = data.products ?? [];
  const batches: BatchRow[] = [];
  for (const p of products) {
    if (p.batches?.length) {
      for (const b of p.batches) {
        batches.push({
          id: b.id,
          productId: p.id,
          productName: p.name,
          category: p.category,
          batchNumber: b.batchNumber,
          quantity: b.quantity,
          costPrice: b.costPrice,
          expiryDate: b.expiryDate,
          location: b.warehouseId ? "WAREHOUSE" : "PHARMACY",
          manufacturer: p.manufacturer ?? "",
          country: p.country ?? "",
          unitType: p.unitType,
        });
      }
    } else {
      batches.push({
        id: p.batchId ?? p.id,
        productId: p.id,
        productName: p.name,
        category: p.category,
        batchNumber: p.batchNumber ?? "-",
        quantity: p.availableQty,
        costPrice: p.costPrice,
        expiryDate: p.expiryDate,
        location: "WAREHOUSE",
        manufacturer: p.manufacturer ?? "",
        country: p.country ?? "",
        unitType: p.unitType,
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

  const { data: batches = [], refetch, isLoading } = useQuery({
    queryKey: ["warehouse"],
    queryFn: fetchWarehouse,
  });

  const filtered = useMemo(() => {
    return batches.filter((b) => {
      const matchCat = category === "ALL" || b.category === category;
      const q = query.trim().toLowerCase();
      const matchQ =
        !q ||
        b.productName.toLowerCase().includes(q) ||
        b.batchNumber.toLowerCase().includes(q) ||
        b.manufacturer.toLowerCase().includes(q);
      return matchCat && matchQ;
    });
  }, [batches, category, query]);

  const alerts = useMemo(() => {
    const low = filtered.filter((b) => b.quantity <= 10);
    const expiry = filtered.filter(
      (b) => isExpired(b.expiryDate) || isNearExpiry(b.expiryDate)
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
    const data = await res.json();
    setMsg(data.message ?? "تمت إضافة الصنف");
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
                  {["BOX", "CARTON", "BOTTLE", "INJECTABLE", "VIAL", "ML", "STRIP"].map(
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
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
        <CardContent className="overflow-x-auto p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-slate-500">جاري التحميل...</p>
          ) : (
            <table className="w-full min-w-[900px] text-sm">
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
                  const days = daysUntilExpiry(b.expiryDate);
                  const expired = isExpired(b.expiryDate);
                  const near = isNearExpiry(b.expiryDate);
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
                          <span>{formatDate(b.expiryDate)}</span>
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
