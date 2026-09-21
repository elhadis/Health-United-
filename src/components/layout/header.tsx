"use client";

import { type ReactNode } from "react";
import { BrandLogo } from "@/components/branding/brand-logo";
import { COMPANY_NAME_AR } from "@/lib/branding";

export function Header({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-secondary/95 px-6 py-4 text-white backdrop-blur no-print">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-sm">
            <BrandLogo size={40} className="h-9 w-9" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-teal-300">
              {COMPANY_NAME_AR}
            </p>
            <h1 className="truncate text-xl font-bold">{title}</h1>
            {subtitle && (
              <p className="mt-0.5 truncate text-sm text-slate-300">{subtitle}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
