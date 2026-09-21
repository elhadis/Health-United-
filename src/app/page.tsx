"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ShoppingCart,
  Package,
  ClipboardList,
  BarChart3,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Wifi,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandLogo } from "@/components/branding/brand-logo";
import { APP_TAGLINE, COMPANY_NAME_AR, COMPANY_NAME_EN } from "@/lib/branding";
import { useNetworkStore } from "@/lib/stores/network-store";
import { formatCurrency } from "@/lib/utils";

async function fetchDashboard() {
  const [analytics, orders] = await Promise.all([
    fetch("/api/analytics?range=weekly").then((r) => r.json()),
    fetch("/api/orders").then((r) => r.json()),
  ]);
  return {
    summary: analytics.summary,
    pendingOrders: (orders.orders ?? []).filter(
      (o: { status: string }) => o.status === "PENDING"
    ).length,
  };
}

const quickLinks = [
  {
    href: "/pos",
    title: "نقطة البيع",
    desc: "بيع سريع مع دعم عدم الاتصال",
    icon: ShoppingCart,
    color: "bg-primary text-white",
  },
  {
    href: "/warehouse",
    title: "المستودع",
    desc: "دفعات، صلاحية، تصنيف بشري/بيطري",
    icon: Package,
    color: "bg-secondary text-white",
  },
  {
    href: "/orders",
    title: "التحويلات",
    desc: "مسار الطلبات بين الصيدلية والمستودع",
    icon: ClipboardList,
    color: "bg-banking text-white",
  },
  {
    href: "/reports",
    title: "التقارير",
    desc: "أرباح ومبيعات وتنبيهات",
    icon: BarChart3,
    color: "bg-success text-white",
  },
];

export default function HomePage() {
  const { isOnline, pendingCount, isSyncing } = useNetworkStore();
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
  });

  const summary = data?.summary;

  return (
    <AppShell
      title="لوحة التحكم"
      subtitle={APP_TAGLINE}
      actions={
        <div className="flex items-center gap-2">
          <Badge variant={isOnline ? "success" : "danger"} className={!isOnline ? "animate-pulse" : ""}>
            <Wifi className="h-3.5 w-3.5" />
            {isOnline ? "Online" : "Offline"}
          </Badge>
          {pendingCount > 0 && (
            <Badge variant="warning">
              {pendingCount} بانتظار المزامنة
              {isSyncing ? "..." : ""}
            </Badge>
          )}
        </div>
      }
    >
      <div className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-l from-secondary via-slate-800 to-teal-900 p-4 text-white shadow-lg sm:mb-8 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-white p-1">
                <BrandLogo size={44} className="h-10 w-10" />
              </div>
              <div>
                <p className="text-sm font-medium text-teal-300">{COMPANY_NAME_EN}</p>
                <p className="text-xs text-slate-400">{APP_TAGLINE}</p>
              </div>
            </div>
            <h2 className="text-xl font-bold sm:text-2xl md:text-3xl">{COMPANY_NAME_AR}</h2>
            <p className="mt-2 max-w-xl text-sm text-slate-300">
              مبيعات، مخزون، تحويلات، وتقارير أرباح — مع مزامنة تلقائية عند عودة الإنترنت.
            </p>
          </div>
          <Button asChild size="lg" className="w-full bg-primary hover:bg-teal-600 sm:w-auto">
            <Link href="/pos">
              <ShoppingCart className="h-4 w-4" />
              ابدأ البيع الآن
            </Link>
          </Button>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {quickLinks.map((link, i) => (
          <motion.div
            key={link.href}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Link href={link.href} className="block transition-all active:scale-95">
              <Card className="h-full hover:border-primary/30 hover:shadow-md">
                <CardContent className="flex items-start gap-3 p-5">
                  <div className={`rounded-xl p-3 ${link.color}`}>
                    <link.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{link.title}</h3>
                    <p className="mt-1 text-xs text-slate-500">{link.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "مبيعات الأسبوع",
            value: formatCurrency(summary?.totalSales ?? 0),
            icon: DollarSign,
            tone: "text-primary bg-primary/10",
          },
          {
            label: "صافي الربح",
            value: formatCurrency(summary?.totalProfit ?? 0),
            icon: TrendingUp,
            tone: "text-success bg-success/10",
          },
          {
            label: "طلبات معلقة",
            value: String(data?.pendingOrders ?? 0),
            icon: ClipboardList,
            tone: "text-warning bg-warning/10",
          },
          {
            label: "تنبيهات مخزون",
            value: String((summary?.lowStockCount ?? 0) + (summary?.nearExpiryCount ?? 0)),
            icon: AlertTriangle,
            tone: "text-danger bg-danger/10",
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-3 p-5">
              <div className={`rounded-xl p-3 ${stat.tone}`}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">{stat.label}</p>
                <p className="text-xl font-bold">
                  {isLoading ? "..." : stat.value}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              تنبيهات عاجلة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(summary?.lowStock ?? []).slice(0, 4).map(
              (p: { id: string; name: string; availableQty: number }) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg bg-warning/5 px-3 py-2 text-sm"
                >
                  <span>{p.name}</span>
                  <Badge variant="warning">متبقي {p.availableQty}</Badge>
                </div>
              )
            )}
            {(summary?.nearExpiry ?? []).slice(0, 3).map(
              (p: { id: string; name: string; expiryDate: string }) => (
                <div
                  key={`${p.id}-${p.expiryDate}`}
                  className="flex items-center justify-between rounded-lg bg-danger/5 px-3 py-2 text-sm"
                >
                  <span>{p.name}</span>
                  <Badge variant="danger">صلاحية قريبة</Badge>
                </div>
              )
            )}
            {!summary?.lowStock?.length && !summary?.nearExpiry?.length && (
              <p className="text-sm text-slate-500">لا توجد تنبيهات</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              الأكثر مبيعاً
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(summary?.topSelling ?? []).slice(0, 5).map(
              (
                item: { name: string; revenue: number },
                i: number
              ) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {i + 1}
                    </span>
                    {item.name}
                  </span>
                  <span className="font-semibold text-primary">
                    {formatCurrency(item.revenue)}
                  </span>
                </div>
              )
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
