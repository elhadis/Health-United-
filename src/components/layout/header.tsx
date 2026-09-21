"use client";

import { type ReactNode } from "react";
import { Menu } from "lucide-react";
import { BrandLogo } from "@/components/branding/brand-logo";
import { COMPANY_NAME_AR } from "@/lib/branding";
import { Button } from "@/components/ui/button";
import { useUiStore } from "@/lib/stores/ui-store";

export function Header({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const toggleMobileNav = useUiStore((s) => s.toggleMobileNav);

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-secondary/95 px-3 py-3 text-white shadow-md backdrop-blur-md no-print sm:px-5 sm:py-4 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 text-white hover:bg-white/10 lg:hidden"
            onClick={toggleMobileNav}
            aria-label="فتح القائمة"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="hidden h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-sm ring-1 ring-white/15 sm:flex sm:h-11 sm:w-11">
            <BrandLogo size={40} className="h-8 w-8 sm:h-9 sm:w-9" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium text-teal-300 sm:text-xs">
              {COMPANY_NAME_AR}
            </p>
            <h1 className="truncate text-base font-bold sm:text-xl">{title}</h1>
            {subtitle && (
              <p className="mt-0.5 hidden truncate text-sm text-slate-300 sm:block">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
