import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-white shadow-sm shadow-teal-700/20 hover:bg-teal-700 hover:shadow-md",
        secondary:
          "bg-secondary text-white shadow-sm hover:bg-slate-800 hover:shadow-md",
        danger:
          "bg-danger text-white shadow-sm shadow-red-600/15 hover:bg-red-600 hover:shadow-md",
        warning:
          "bg-warning text-white shadow-sm hover:bg-amber-600 hover:shadow-md",
        success:
          "bg-success text-white shadow-sm hover:bg-emerald-600 hover:shadow-md",
        outline:
          "border border-slate-200 bg-white text-secondary shadow-sm hover:border-slate-300 hover:bg-slate-50",
        ghost: "hover:bg-slate-100 text-secondary",
        indigo:
          "bg-banking text-white shadow-sm hover:bg-indigo-600 hover:shadow-md",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-5 text-base sm:h-12 sm:px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
