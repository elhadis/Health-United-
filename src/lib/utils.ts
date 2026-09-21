import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string, currency = "ج.س"): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return `${num.toLocaleString("ar-SD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("ar-SD", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function generateReceiptNumber(): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `RCP-${stamp}-${rand}`;
}

export function generateOrderNumber(): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `ORD-${stamp}-${rand}`;
}

export function daysUntilExpiry(expiryDate: Date | string): number {
  const expiry = typeof expiryDate === "string" ? new Date(expiryDate) : expiryDate;
  const now = new Date();
  const diff = expiry.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function isNearExpiry(expiryDate: Date | string, days = 90): boolean {
  return daysUntilExpiry(expiryDate) <= days && daysUntilExpiry(expiryDate) >= 0;
}

export function isExpired(expiryDate: Date | string): boolean {
  return daysUntilExpiry(expiryDate) < 0;
}
