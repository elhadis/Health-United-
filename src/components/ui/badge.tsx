import * as React from "react";
import { cn } from "@/lib/utils";

const Badge = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: "default" | "success" | "warning" | "danger" | "indigo" | "outline" | "secondary";
  }
>(({ className, variant = "default", ...props }, ref) => {
  const variants = {
    default: "bg-primary/10 text-primary border-primary/20",
    success: "bg-success/10 text-emerald-700 border-success/20",
    warning: "bg-warning/10 text-amber-700 border-warning/20",
    danger: "bg-danger/10 text-red-700 border-danger/20",
    indigo: "bg-banking/10 text-indigo-700 border-banking/20",
    outline: "bg-white text-secondary border-slate-200",
    secondary: "bg-slate-100 text-secondary border-slate-200",
  };

  return (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
});
Badge.displayName = "Badge";

export { Badge };
