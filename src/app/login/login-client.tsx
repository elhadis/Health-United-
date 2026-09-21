"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Lock, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/lib/stores/auth-store";
import { BrandLogo } from "@/components/branding/brand-logo";
import { APP_TAGLINE, COMPANY_NAME_AR, COMPANY_NAME_EN } from "@/lib/branding";

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUser = useAuthStore((s) => s.setUser);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تسجيل الدخول");
      setUser({
        id: data.user.id,
        name: data.user.name,
        username: data.user.username,
        role: data.user.role,
        pharmacyId: data.user.pharmacyId ?? undefined,
        warehouseId: data.user.warehouseId ?? undefined,
      });
      const next = searchParams.get("next");
      router.replace(next || data.redirectTo || "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "فشل تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-bl from-slate-900 via-slate-800 to-teal-900 px-3 py-8 sm:px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(13,148,136,0.25),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(99,102,241,0.15),transparent_35%)]" />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-white/95 p-5 shadow-2xl backdrop-blur sm:p-8"
      >
        <div className="mb-6 text-center sm:mb-8">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-lg shadow-teal-600/20 ring-1 ring-teal-100 sm:h-16 sm:w-16">
            <BrandLogo size={56} className="h-11 w-11 sm:h-12 sm:w-12" priority />
          </div>
          <h1 className="text-xl font-bold text-secondary sm:text-2xl">
            {COMPANY_NAME_AR}
          </h1>
          <p className="mt-0.5 text-xs font-medium text-slate-500">
            {COMPANY_NAME_EN}
          </p>
          <p className="mt-2 text-sm text-slate-500">{APP_TAGLINE}</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-secondary">اسم المستخدم</label>
            <div className="relative">
              <UserIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pr-10"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="superadmin"
                autoComplete="username"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-secondary">كلمة المرور</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="password"
                className="pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? "جاري الدخول..." : "دخول"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          الحساب الافتراضي: superadmin / AdminPassword123
        </p>
      </motion.div>
    </div>
  );
}
