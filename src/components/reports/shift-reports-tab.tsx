"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Clock,
  Banknote,
  Smartphone,
  DollarSign,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

type ShiftRow = {
  id: string;
  cashierId: string;
  cashierName: string;
  status: "OPEN" | "CLOSED";
  startedAt: string;
  endedAt: string | null;
  totalSales: number;
  totalCash: number;
  totalBank: number;
  salesCount: number;
  cashier?: { id: string; name: string; username: string } | null;
  pharmacy?: { id: string; name: string } | null;
};

type FilterPreset = "today" | "week" | "month" | "custom";

function getPresetRange(preset: FilterPreset) {
  const to = new Date();
  const from = new Date(to);
  if (preset === "today") from.setHours(0, 0, 0, 0);
  else if (preset === "week") from.setDate(from.getDate() - 7);
  else if (preset === "month") from.setMonth(from.getMonth() - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function fetchShifts(params: {
  from?: string;
  to?: string;
  cashierId?: string;
}) {
  const q = new URLSearchParams();
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.cashierId) q.set("cashierId", params.cashierId);
  const res = await fetch(`/api/shifts?${q.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "فشل جلب تقارير الورديات");
  return data as {
    shifts: ShiftRow[];
    summary: {
      shiftCount: number;
      totalSales: number;
      totalCash: number;
      totalBank: number;
      openCount: number;
      closedCount: number;
    };
  };
}

async function fetchCashiers() {
  const res = await fetch("/api/users");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "فشل جلب الكاشيرين");
  return ((data.users ?? []) as Array<{
    id: string;
    name: string;
    username: string;
    role: string;
  }>).filter((u) => u.role === "USER");
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ar-SD", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ShiftReportsTab() {
  const [preset, setPreset] = useState<FilterPreset>("week");
  const [cashierId, setCashierId] = useState("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = useMemo(() => {
    if (preset === "custom") {
      return {
        from: customFrom
          ? new Date(customFrom).toISOString()
          : undefined,
        to: customTo
          ? new Date(`${customTo}T23:59:59`).toISOString()
          : undefined,
      };
    }
    return getPresetRange(preset);
  }, [preset, customFrom, customTo]);

  const { data: cashiers = [] } = useQuery({
    queryKey: ["shift-cashiers"],
    queryFn: fetchCashiers,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["shift-reports", range.from, range.to, cashierId],
    queryFn: () =>
      fetchShifts({
        from: range.from,
        to: range.to,
        cashierId: cashierId || undefined,
      }),
  });

  const shifts = data?.shifts ?? [];
  const summary = data?.summary ?? {
    shiftCount: 0,
    totalSales: 0,
    totalCash: 0,
    totalBank: 0,
    openCount: 0,
    closedCount: 0,
  };

  return (
    <div className="no-print space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Clock className="h-5 w-5 text-primary" />
            تقارير الورديات
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
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
                type="button"
                size="sm"
                variant={preset === key ? "default" : "outline"}
                onClick={() => setPreset(key)}
              >
                {label}
              </Button>
            ))}
          </div>

          {preset === "custom" && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                aria-label="من تاريخ"
              />
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                aria-label="إلى تاريخ"
              />
            </div>
          )}

          <div className="grid gap-2 sm:max-w-sm">
            <label className="text-xs font-medium text-slate-500">
              تصفية حسب الكاشير
            </label>
            <select
              className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              value={cashierId}
              onChange={(e) => setCashierId(e.target.value)}
            >
              <option value="">كل الكاشيرين</option>
              {cashiers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (@{c.username})
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "إجمالي إيرادات الورديات",
            value: formatCurrency(summary.totalSales),
            icon: DollarSign,
            color: "text-primary bg-primary/10",
          },
          {
            label: "المدفوعات النقدية",
            value: formatCurrency(summary.totalCash),
            icon: Banknote,
            color: "text-emerald-700 bg-emerald-50",
          },
          {
            label: "التحويلات البنكية",
            value: formatCurrency(summary.totalBank),
            icon: Smartphone,
            color: "text-indigo-700 bg-indigo-50",
          },
          {
            label: "عدد الورديات",
            value: String(summary.shiftCount),
            icon: Users,
            color: "text-slate-700 bg-slate-100",
          },
        ].map((card) => (
          <Card
            key={card.label}
            className="transition-shadow hover:shadow-md hover:ring-2 hover:ring-primary/15"
          >
            <CardContent className="flex items-center gap-3 p-4 sm:p-5">
              <div className={cn("rounded-xl p-3", card.color)}>
                <card.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 sm:text-sm">{card.label}</p>
                <p className="truncate text-base font-bold sm:text-lg">
                  {card.value}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            سجل الورديات
            {isFetching && (
              <span className="ms-2 text-xs font-normal text-slate-400">
                تحديث...
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="table-scroll overflow-x-auto p-0">
          {isLoading ? (
            <p className="p-5 text-sm text-slate-500">جاري التحميل...</p>
          ) : (
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-right font-medium">الكاشير</th>
                  <th className="px-4 py-3 text-right font-medium">البداية</th>
                  <th className="px-4 py-3 text-right font-medium">النهاية</th>
                  <th className="px-4 py-3 text-right font-medium">الإجمالي</th>
                  <th className="px-4 py-3 text-right font-medium">نقدي</th>
                  <th className="px-4 py-3 text-right font-medium">بنكي</th>
                  <th className="px-4 py-3 text-right font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium">{s.cashierName}</td>
                    <td className="px-4 py-3 text-xs sm:text-sm">
                      {formatDateTime(s.startedAt)}
                    </td>
                    <td className="px-4 py-3 text-xs sm:text-sm">
                      {s.endedAt ? formatDateTime(s.endedAt) : "—"}
                    </td>
                    <td className="px-4 py-3 font-semibold text-primary">
                      {formatCurrency(s.totalSales)}
                    </td>
                    <td className="px-4 py-3">{formatCurrency(s.totalCash)}</td>
                    <td className="px-4 py-3">{formatCurrency(s.totalBank)}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={s.status === "OPEN" ? "success" : "secondary"}
                      >
                        {s.status === "OPEN" ? "مفتوحة" : "مغلقة"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!isLoading && shifts.length === 0 && (
            <p className="p-5 text-sm text-slate-500">
              لا توجد ورديات في الفترة المحددة
            </p>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-slate-400">
        تاريخ العرض المرجعي: {formatDate(new Date().toISOString())}
      </p>
    </div>
  );
}
