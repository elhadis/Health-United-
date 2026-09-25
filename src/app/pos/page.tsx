"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ShoppingCart,
  Receipt,
  Plus,
  Minus,
  Trash2,
  Banknote,
  Smartphone,
  Pill,
  Package,
  AlertTriangle,
  Printer,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrintBrandHeader } from "@/components/branding/print-brand-header";
import { PosShiftPanel } from "@/components/pos/shift-panel";
import { useCartStore } from "@/lib/stores/cart-store";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useNetworkStore } from "@/lib/stores/network-store";
import {
  saveOfflineSale,
  cacheProducts,
  searchCachedProducts,
  getPendingCount,
  type CachedProduct,
} from "@/lib/offline/db";
import { formatCurrency, isExpired, isNearExpiry } from "@/lib/utils";

type ProductRow = CachedProduct & {
  unitsPerBox?: number;
  lowStockThreshold?: number;
};

type LastReceipt = {
  receiptNumber: string;
  paymentMethod: string;
  bankAppName?: string;
  total: number;
  profit: number;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  createdAt: string;
};

/** Normalize Arabic/Latin text for case-insensitive, diacritic-tolerant search */
function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesProductSearch(product: ProductRow, rawQuery: string): boolean {
  const q = normalizeSearchText(rawQuery);
  if (!q) return true;
  const haystack = normalizeSearchText(
    [product.name, product.sku ?? "", product.manufacturer ?? ""].join(" ")
  );
  // Support multi-token search (spaces) — every token must match
  return q.split(" ").every((token) => token && haystack.includes(token));
}

/** Fetch full pharmacy/in-stock catalog (search is applied client-side). */
async function fetchAllPosProducts(
  preferPharmacy?: boolean,
  pharmacyId?: string | null
): Promise<ProductRow[]> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return (await searchCachedProducts("")) as ProductRow[];
  }
  try {
    const params = new URLSearchParams();
    if (preferPharmacy) {
      params.set("location", "pharmacy");
      if (pharmacyId) params.set("pharmacyId", pharmacyId);
    }
    const res = await fetch(`/api/products?${params.toString()}`);
    if (!res.ok) throw new Error("fetch failed");
    const data = await res.json();
    let products = ((data.products ?? []) as ProductRow[]).filter(
      (p) => (p.availableQty ?? 0) > 0
    );
    // If pharmacy filter returned nothing, fall back to all in-stock products
    if (preferPharmacy && products.length === 0) {
      const fallback = await fetch("/api/products");
      if (fallback.ok) {
        const fb = await fallback.json();
        products = ((fb.products ?? []) as ProductRow[]).filter(
          (p) => (p.availableQty ?? 0) > 0
        );
      }
    }
    await cacheProducts(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        category: p.category,
        unitType: p.unitType,
        unitsPerBox: p.unitsPerBox ?? 1,
        defaultPrice: p.defaultPrice,
        costPrice: p.costPrice,
        manufacturer: p.manufacturer,
        country: p.country,
        availableQty: p.availableQty,
        batchId: p.batchId,
        batchNumber: p.batchNumber,
        expiryDate: p.expiryDate,
        updatedAt: new Date().toISOString(),
      }))
    );
    return products;
  } catch {
    return (await searchCachedProducts("")) as ProductRow[];
  }
}

export default function POSPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [checkoutMsg, setCheckoutMsg] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<LastReceipt | null>(null);
  const queryClient = useQueryClient();

  const {
    items,
    paymentMethod,
    bankAppName,
    transactionRef,
    addItem,
    removeItem,
    updateQuantity,
    updatePrice,
    setPaymentMethod,
    setBankDetails,
    clearCart,
  } = useCartStore();

  const user = useAuthStore((s) => s.user);
  const { isOnline, setPendingCount } = useNetworkStore();
  const requireShift = user?.role === "USER";

  // Debounce search input for smooth typing without lag
  useEffect(() => {
    const timer = window.setTimeout(() => {
      startTransition(() => setDebouncedQuery(query));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const preferPharmacy = user?.role === "USER";

  const { data: catalog = [], isFetching } = useQuery({
    queryKey: ["pos-products", user?.pharmacyId ?? "", preferPharmacy],
    queryFn: () => fetchAllPosProducts(preferPharmacy, user?.pharmacyId),
    refetchOnMount: "always",
    staleTime: 0,
  });

  const products = useMemo(
    () => catalog.filter((p) => matchesProductSearch(p, debouncedQuery)),
    [catalog, debouncedQuery]
  );

  const { data: activeShift } = useQuery({
    queryKey: ["current-shift"],
    queryFn: async () => {
      const res = await fetch("/api/shifts?current=1");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل جلب الوردية");
      return data.shift as { id: string; status: string } | null;
    },
    enabled: !!user,
  });

  const shiftOpen = activeShift?.status === "OPEN";
  const blockCheckout = requireShift && !shiftOpen;

  // Derive totals from items so the cart re-renders on every change
  const cartTotal = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const cartProfit = items.reduce(
    (sum, i) => sum + (i.unitPrice - i.costPrice) * i.quantity,
    0
  );
  const cartItemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const handleSearch = (value: string) => {
    setQuery(value);
  };

  const handleAddProduct = (product: ProductRow) => {
    if (product.availableQty <= 0) return;
    addItem({
      productId: product.id,
      productName: product.name,
      batchId: product.batchId,
      batchNumber: product.batchNumber,
      unitType: product.unitType,
      unitsPerBox: product.unitsPerBox ?? 1,
      unitPrice: Number(product.defaultPrice) || 0,
      costPrice: Number(product.costPrice) || 0,
      availableQty: product.availableQty,
      sellAsUnit: true,
      quantity: 1,
    });
  };

  const completeSale = async () => {
    if (items.length === 0 || checkingOut) return;
    if (blockCheckout) {
      setCheckoutMsg("يجب فتح وردية قبل إتمام البيع");
      return;
    }
    setCheckingOut(true);
    setCheckoutMsg(null);

    const payload = {
      pharmacyId: user?.pharmacyId,
      cashierId: user?.id,
      paymentMethod,
      bankAppName: paymentMethod === "BANK_APP" ? bankAppName : undefined,
      transactionRef: paymentMethod === "BANK_APP" ? transactionRef : undefined,
      items: items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        batchId: i.batchId,
        quantity: i.quantity,
        unitType: i.unitType,
        unitPrice: i.unitPrice,
        costPrice: i.costPrice,
        lineTotal: i.unitPrice * i.quantity,
        lineProfit: (i.unitPrice - i.costPrice) * i.quantity,
      })),
      createdAt: new Date().toISOString(),
    };

    const receiptSnapshot: LastReceipt = {
      receiptNumber: "محلي",
      paymentMethod,
      bankAppName: paymentMethod === "BANK_APP" ? bankAppName : undefined,
      total: cartTotal,
      profit: cartProfit,
      items: items.map((i) => ({
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        lineTotal: i.unitPrice * i.quantity,
      })),
      createdAt: new Date().toISOString(),
    };

    try {
      if (!isOnline) {
        await saveOfflineSale({
          ...payload,
          pharmacyId: user?.pharmacyId || "offline-pharmacy",
          paymentMethod,
          subtotal: cartTotal,
          total: cartTotal,
          totalCost: items.reduce((s, i) => s + i.costPrice * i.quantity, 0),
          profit: cartProfit,
        });
        setPendingCount(await getPendingCount());
        setLastReceipt({
          ...receiptSnapshot,
          receiptNumber: `OFF-${Date.now()}`,
        });
        clearCart();
        setCheckoutMsg("تم حفظ البيع محلياً — ستتم المزامنة عند عودة الاتصال");
      } else {
        const res = await fetch("/api/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "فشل البيع");
        setLastReceipt({
          ...receiptSnapshot,
          receiptNumber: data.sale?.receiptNumber ?? `RCP-${Date.now()}`,
        });
        clearCart();
        setCheckoutMsg(`تم إتمام البيع — ${data.sale?.receiptNumber ?? "إيصال جديد"}`);
        void queryClient.invalidateQueries({ queryKey: ["pos-products"] });
        void queryClient.invalidateQueries({ queryKey: ["reception-report"] });
        void queryClient.invalidateQueries({ queryKey: ["analytics"] });
        void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        void queryClient.invalidateQueries({ queryKey: ["current-shift"] });
      }
    } catch (err) {
      console.error("[POS] checkout error:", err);
      // Fallback to offline queue if online request fails due to network
      const message = err instanceof Error ? err.message : "فشل إتمام البيع";
      const isValidation =
        message.includes("المخزون") ||
        message.includes("المنتج") ||
        message.includes("الصيدلية") ||
        message.includes("كمية");

      if (isValidation) {
        setCheckoutMsg(message);
        return;
      }

      try {
        await saveOfflineSale({
          ...payload,
          pharmacyId: user?.pharmacyId || "offline-pharmacy",
          paymentMethod,
          subtotal: cartTotal,
          total: cartTotal,
          totalCost: items.reduce((s, i) => s + i.costPrice * i.quantity, 0),
          profit: cartProfit,
        });
        setPendingCount(await getPendingCount());
        setLastReceipt({
          ...receiptSnapshot,
          receiptNumber: `OFF-${Date.now()}`,
        });
        clearCart();
        setCheckoutMsg("تعذر الاتصال — حُفظ البيع في قائمة المزامنة");
      } catch {
        setCheckoutMsg(message);
      }
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <AppShell
      title="نقطة البيع (POS)"
      subtitle="بيع سريع مع دعم العمل دون اتصال ومزامنة تلقائية"
      actions={
        <Badge variant={isOnline ? "success" : "danger"}>
          {isOnline ? "متصل" : "غير متصل"}
        </Badge>
      }
    >
      <div className="mb-4 no-print">
        <PosShiftPanel
          cashierName={user?.name || "كاشير"}
          requireShift={requireShift}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5 lg:gap-6 no-print">
        <div className="order-2 space-y-4 lg:order-1 lg:col-span-3">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="ابحث بالاسم أو الرمز أو الشركة المصنعة..."
              className="h-12 pr-10 text-base"
              autoFocus
            />
          </div>

          {(isFetching || isPending) && (
            <p className="text-xs text-slate-500">
              {isFetching ? "جاري تحميل المنتجات..." : "جاري التصفية..."}
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {products.map((product) => {
                const expired = product.expiryDate ? isExpired(product.expiryDate) : false;
                const near = product.expiryDate ? isNearExpiry(product.expiryDate) : false;
                const threshold = product.lowStockThreshold ?? 10;
                const isLow =
                  product.availableQty > 0 && product.availableQty <= threshold;
                const canAdd = !expired && product.availableQty > 0;
                return (
                  <motion.div
                    key={`${product.id}-${product.batchId ?? "nobatch"}`}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    role="button"
                    tabIndex={canAdd ? 0 : -1}
                    onClick={() => {
                      if (canAdd) handleAddProduct(product);
                    }}
                    onKeyDown={(e) => {
                      if (canAdd && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        handleAddProduct(product);
                      }
                    }}
                    className={`rounded-xl border border-slate-200 bg-white p-4 text-right shadow-sm transition-all ${
                      canAdd
                        ? "cursor-pointer hover:border-primary/40 hover:shadow-md active:scale-95"
                        : "cursor-not-allowed opacity-50"
                    }`}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {product.category === "VETERINARY" ? (
                          <Package className="h-4 w-4" />
                        ) : (
                          <Pill className="h-4 w-4" />
                        )}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <Badge variant={product.category === "HUMAN" ? "default" : "warning"}>
                          {product.category === "HUMAN" ? "بشري" : "بيطري"}
                        </Badge>
                        {canAdd && (
                          <Badge variant={isLow ? "warning" : "success"}>
                            {isLow ? "كمية منخفضة" : "متوفر"}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <h3 className="font-semibold text-secondary">{product.name}</h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {product.sku ? `${product.sku} · ` : ""}
                      {product.manufacturer} · {product.unitType}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="font-bold text-primary">
                        {formatCurrency(product.defaultPrice)}
                      </span>
                      <span className="text-xs text-slate-500">
                        المتاح: {product.availableQty}
                      </span>
                    </div>
                    {(expired || near) && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-danger">
                        <AlertTriangle className="h-3 w-3" />
                        {expired ? "منتهي الصلاحية" : "قرب انتهاء الصلاحية"}
                      </div>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      className="mt-3 w-full"
                      disabled={!canAdd}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddProduct(product);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      إضافة
                    </Button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {products.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-slate-500">
                لا توجد نتائج — جرّب كلمة بحث أخرى
              </CardContent>
            </Card>
          )}
        </div>

        <div className="order-1 lg:order-2 lg:col-span-2">
          <Card className="sticky top-[4.5rem] overflow-hidden shadow-md sm:top-24">
            <CardHeader className="border-b border-slate-100 bg-secondary text-white">
              <CardTitle className="flex items-center gap-2 text-white">
                <ShoppingCart className="h-5 w-5" />
                سلة البيع
                <Badge className="mr-auto border-white/20 bg-white/10 text-white">
                  {cartItemCount} صنف
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="max-h-[340px] space-y-3 overflow-y-auto">
                {items.length === 0 && (
                  <p className="py-8 text-center text-sm text-slate-400">
                    ابحث وأضف منتجات لبدء البيع
                  </p>
                )}
                {items.map((item) => (
                  <div
                    key={`${item.productId}-${item.batchId}`}
                    className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{item.productName}</p>
                        <p className="text-xs text-slate-500">{item.unitType}</p>
                      </div>
                      <button
                        onClick={() => removeItem(item.productId, item.batchId)}
                        className="text-danger transition-all active:scale-95"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        onClick={() =>
                          updateQuantity(item.productId, item.quantity - 1, item.batchId)
                        }
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        onClick={() =>
                          updateQuantity(item.productId, item.quantity + 1, item.batchId)
                        }
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) =>
                          updatePrice(
                            item.productId,
                            Number(e.target.value) || 0,
                            item.batchId
                          )
                        }
                        className="mr-auto h-8 w-28 text-left"
                        title="سعر البيع اليدوي"
                      />
                    </div>
                    <p className="mt-2 text-left text-sm font-semibold text-primary">
                      {formatCurrency(item.unitPrice * item.quantity)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="flex gap-2">
                  <Button
                    variant={paymentMethod === "CASH" ? "default" : "outline"}
                    className="flex-1"
                    onClick={() => setPaymentMethod("CASH")}
                  >
                    <Banknote className="h-4 w-4" />
                    نقدي
                  </Button>
                  <Button
                    variant={paymentMethod === "BANK_APP" ? "indigo" : "outline"}
                    className="flex-1"
                    onClick={() => setPaymentMethod("BANK_APP")}
                  >
                    <Smartphone className="h-4 w-4" />
                    تطبيق بنكي
                  </Button>
                </div>

                {paymentMethod === "BANK_APP" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid gap-2"
                  >
                    <Input
                      placeholder="اسم التطبيق (بنكك، فوري...)"
                      value={bankAppName}
                      onChange={(e) => setBankDetails(e.target.value, transactionRef)}
                    />
                    <Input
                      placeholder="رقم العملية / الإيصال"
                      value={transactionRef}
                      onChange={(e) => setBankDetails(bankAppName, e.target.value)}
                    />
                  </motion.div>
                )}

                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">الإجمالي</span>
                    <span className="font-bold">{formatCurrency(cartTotal)}</span>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span className="text-slate-500">الربح المتوقع</span>
                    <span className="font-semibold text-success">
                      {formatCurrency(cartProfit)}
                    </span>
                  </div>
                </div>

                <Button
                  size="lg"
                  className="w-full"
                  disabled={
                    items.length === 0 ||
                    checkingOut ||
                    blockCheckout ||
                    (paymentMethod === "BANK_APP" &&
                      (!bankAppName.trim() || !transactionRef.trim()))
                  }
                  onClick={completeSale}
                >
                  <Receipt className="h-4 w-4" />
                  {checkingOut ? "جاري الإتمام..." : "إتمام البيع"}
                </Button>

                {checkoutMsg && (
                  <motion.p
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`rounded-lg px-3 py-2 text-center text-sm ${
                      checkoutMsg.includes("فشل") ||
                      checkoutMsg.includes("غير") ||
                      checkoutMsg.includes("المخزون")
                        ? "bg-danger/10 text-red-700"
                        : "bg-success/10 text-emerald-700"
                    }`}
                  >
                    {checkoutMsg}
                  </motion.p>
                )}

                {lastReceipt && (
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full no-print"
                      onClick={() => window.print()}
                    >
                      <Printer className="h-4 w-4" />
                      طباعة الإيصال
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {lastReceipt && (
        <div className="print-only print-document mt-6 rounded-xl border border-slate-200 bg-white p-6">
          <PrintBrandHeader documentTitle="إيصال بيع" />
          <div className="mb-4 flex flex-wrap justify-between gap-2 text-sm text-slate-600">
            <span>رقم الإيصال: {lastReceipt.receiptNumber}</span>
            <span>
              {new Date(lastReceipt.createdAt).toLocaleString("ar-SD")}
            </span>
          </div>
          <table className="mb-4 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-right text-slate-500">
                <th className="py-2 font-medium">المنتج</th>
                <th className="py-2 font-medium">الكمية</th>
                <th className="py-2 font-medium">السعر</th>
                <th className="py-2 font-medium">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {lastReceipt.items.map((item, idx) => (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="py-2">{item.productName}</td>
                  <td className="py-2">{item.quantity}</td>
                  <td className="py-2">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-2">{formatCurrency(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between font-bold">
              <span>الإجمالي</span>
              <span>{formatCurrency(lastReceipt.total)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>طريقة الدفع</span>
              <span>
                {lastReceipt.paymentMethod === "BANK_APP"
                  ? `تطبيق بنكي${lastReceipt.bankAppName ? ` · ${lastReceipt.bankAppName}` : ""}`
                  : "نقداً"}
              </span>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
