"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  ClipboardList,
  BarChart3,
  Users,
  LogOut,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NetworkStatus } from "@/components/layout/network-status";
import { useAuthStore, roleLabel } from "@/lib/stores/auth-store";
import { useUiStore } from "@/lib/stores/ui-store";
import type { Role } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/branding/brand-logo";
import { APP_TAGLINE, COMPANY_NAME_AR } from "@/lib/branding";

const navItems: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
}[] = [
  {
    href: "/",
    label: "لوحة التحكم",
    icon: LayoutDashboard,
    roles: ["ADMINISTRATOR", "ADMIN", "USER"],
  },
  {
    href: "/pos",
    label: "نقطة البيع",
    icon: ShoppingCart,
    roles: ["ADMINISTRATOR", "ADMIN", "USER"],
  },
  {
    href: "/warehouse",
    label: "المستودع",
    icon: Package,
    roles: ["ADMINISTRATOR", "ADMIN"],
  },
  {
    href: "/orders",
    label: "الطلبات والتحويلات",
    icon: ClipboardList,
    roles: ["ADMINISTRATOR", "ADMIN", "USER"],
  },
  {
    href: "/reports",
    label: "التقارير والأرباح",
    icon: BarChart3,
    roles: ["ADMINISTRATOR"],
  },
  {
    href: "/users",
    label: "المستخدمون والصلاحيات",
    icon: Users,
    roles: ["ADMINISTRATOR"],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logoutLocal = useAuthStore((s) => s.logout);
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const closeMobileNav = useUiStore((s) => s.closeMobileNav);

  const visible = navItems.filter(
    (item) => user && item.roles.includes(user.role)
  );

  const handleLogout = async () => {
    closeMobileNav();
    await fetch("/api/auth/logout", { method: "POST" });
    logoutLocal();
    router.replace("/login");
    router.refresh();
  };

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm transition-opacity duration-300 no-print lg:hidden",
          mobileNavOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        )}
        onClick={closeMobileNav}
        aria-hidden={!mobileNavOpen}
      />

      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-72 max-w-[88vw] flex-col bg-secondary text-white shadow-2xl transition-transform duration-300 ease-out no-print",
          "lg:z-40 lg:w-64 lg:max-w-none lg:translate-x-0 lg:shadow-none",
          mobileNavOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4 sm:px-5 sm:py-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-sm ring-1 ring-white/20">
            <BrandLogo size={40} className="h-9 w-9" priority />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">
              {COMPANY_NAME_AR}
            </p>
            <p className="truncate text-xs text-slate-400">{APP_TAGLINE}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 text-slate-300 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={closeMobileNav}
            aria-label="إغلاق القائمة"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {visible.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobileNav}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 active:scale-[0.98]",
                  active
                    ? "bg-primary text-white shadow-md shadow-teal-900/30"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-white/10 p-4">
          <NetworkStatus />
          {user && (
            <div className="rounded-xl bg-white/5 p-3 text-xs ring-1 ring-white/10">
              <p className="truncate font-medium text-white">{user.name}</p>
              <p className="mt-0.5 truncate text-slate-400">@{user.username}</p>
              <p className="mt-1 text-teal-300">{roleLabel(user.role)}</p>
            </div>
          )}
          <Button
            variant="ghost"
            className="w-full justify-start text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            تسجيل الخروج
          </Button>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Boxes className="h-3.5 w-3.5" />
            <span>بشري · بيطري</span>
          </div>
        </div>
      </aside>
    </>
  );
}
