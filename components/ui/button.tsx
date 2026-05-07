import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg" | "icon";
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md border font-medium transition duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500",
        variant === "primary" && "violet-glow border-violet-500/50 bg-violet-600 text-white hover:bg-violet-500",
        variant === "secondary" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20",
        variant === "ghost" && "border-white/10 bg-white/5 text-zinc-100 hover:border-violet-400/40 hover:bg-violet-500/10",
        variant === "danger" && "border-red-500/40 bg-red-500/10 text-red-100 hover:bg-red-500/20",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-5 text-base",
        size === "icon" && "h-10 w-10 p-0",
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
