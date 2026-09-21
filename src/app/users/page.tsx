"use client";

import { FormEvent, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Users, UserPlus, Shield, Trash2 } from "lucide-react";
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
import { roleLabel, useAuthStore, canDeleteRecords } from "@/lib/stores/auth-store";
import type { Role } from "@/lib/auth-session";
import { formatDate } from "@/lib/utils";

type UserRow = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: Role;
  pharmacyId: string | null;
  warehouseId: string | null;
  createdAt: string;
  pharmacy?: { id: string; name: string } | null;
  warehouse?: { id: string; name: string } | null;
};

export default function UsersPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const allowDelete = canDeleteRecords(currentUser?.role);
  const [open, setOpen] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    username: "",
    password: "",
    role: "USER" as Role,
    pharmacyId: "",
    warehouseId: "",
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل جلب المستخدمين");
      return data.users as UserRow[];
    },
  });

  const { data: orgs } = useQuery({
    queryKey: ["pharmacies"],
    queryFn: async () => {
      const res = await fetch("/api/pharmacies");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل جلب الصيدليات");
      return data as {
        pharmacies: { id: string; name: string }[];
        warehouses: { id: string; name: string }[];
      };
    },
  });

  const roleBadge = useMemo(
    () =>
      ({
        ADMINISTRATOR: "danger" as const,
        ADMIN: "warning" as const,
        USER: "default" as const,
      }),
    []
  );

  const createUser = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        pharmacyId: form.pharmacyId || null,
        warehouseId: form.warehouseId || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "فشل إنشاء المستخدم");
      return;
    }
    setSuccess(`تم إنشاء المستخدم ${data.user.username}`);
    setOpen(false);
    setForm({
      name: "",
      username: "",
      password: "",
      role: "USER",
      pharmacyId: "",
      warehouseId: "",
    });
    void queryClient.invalidateQueries({ queryKey: ["users"] });
  };

  const confirmDeleteUser = async () => {
    if (!deleteUserId) return;
    const res = await fetch(
      `/api/users?id=${encodeURIComponent(deleteUserId)}`,
      { method: "DELETE" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "فشل حذف المستخدم");
      setSuccess(null);
      return;
    }
    setSuccess("تم حذف المستخدم بنجاح");
    setError(null);
    setDeleteUserId(null);
    void queryClient.invalidateQueries({ queryKey: ["users"] });
  };

  return (
    <AppShell
      title="إدارة المستخدمين والصلاحيات"
      subtitle="إنشاء حسابات وتحديد الأدوار وربطها بالصيدليات"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="h-4 w-4" />
              مستخدم جديد
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إنشاء مستخدم جديد</DialogTitle>
            </DialogHeader>
            <form onSubmit={createUser} className="grid gap-3">
              <Input
                placeholder="الاسم الكامل"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <Input
                placeholder="اسم المستخدم"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
              <Input
                type="password"
                placeholder="كلمة المرور (8 أحرف على الأقل)"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={8}
              />
              <select
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as Role })
                }
              >
                <option value="USER">USER — كاشير صيدلية</option>
                <option value="ADMIN">ADMIN — مدير فرع / مستودع</option>
                <option value="ADMINISTRATOR">ADMINISTRATOR — مسؤول النظام</option>
              </select>
              <select
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
                value={form.pharmacyId}
                onChange={(e) => setForm({ ...form, pharmacyId: e.target.value })}
              >
                <option value="">— اختر الصيدلية (اختياري/مطلوب للكاشير) —</option>
                {(orgs?.pharmacies ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
                value={form.warehouseId}
                onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
              >
                <option value="">— اختر المستودع (اختياري) —</option>
                {(orgs?.warehouses ?? []).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              {error && (
                <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
              <Button type="submit">حفظ المستخدم</Button>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      {success && (
        <p className="mb-4 rounded-lg bg-success/10 px-3 py-2 text-sm text-emerald-700">
          {success}
        </p>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {(["ADMINISTRATOR", "ADMIN", "USER"] as Role[]).map((role) => (
          <Card key={role}>
            <CardContent className="flex items-center gap-3 p-5">
              <div className="rounded-xl bg-primary/10 p-3 text-primary">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-slate-500">{roleLabel(role)}</p>
                <p className="text-2xl font-bold">
                  {users.filter((u) => u.role === role).length}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            قائمة المستخدمين
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {isLoading ? (
            <p className="p-6 text-sm text-slate-500">جاري التحميل...</p>
          ) : (
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-right font-medium">الاسم</th>
                  <th className="px-4 py-3 text-right font-medium">المستخدم</th>
                  <th className="px-4 py-3 text-right font-medium">الدور</th>
                  <th className="px-4 py-3 text-right font-medium">الصيدلية</th>
                  <th className="px-4 py-3 text-right font-medium">المستودع</th>
                  <th className="px-4 py-3 text-right font-medium">تاريخ الإنشاء</th>
                  {allowDelete && (
                    <th className="px-4 py-3 text-right font-medium">إجراء</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {users.map((user, idx) => (
                  <motion.tr
                    key={user.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="border-t border-slate-100"
                  >
                    <td className="px-4 py-3 font-medium">{user.name}</td>
                    <td className="px-4 py-3 font-mono text-xs">{user.username}</td>
                    <td className="px-4 py-3">
                      <Badge variant={roleBadge[user.role]}>
                        {roleLabel(user.role)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{user.pharmacy?.name ?? "—"}</td>
                    <td className="px-4 py-3">{user.warehouse?.name ?? "—"}</td>
                    <td className="px-4 py-3">{formatDate(user.createdAt)}</td>
                    {allowDelete && (
                      <td className="px-4 py-3">
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          disabled={user.id === currentUser?.id}
                          onClick={() => setDeleteUserId(user.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          حذف
                        </Button>
                      </td>
                    )}
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={!!deleteUserId}
        onOpenChange={(open) => {
          if (!open) setDeleteUserId(null);
        }}
        onConfirm={confirmDeleteUser}
        title="حذف مستخدم"
      />
    </AppShell>
  );
}
