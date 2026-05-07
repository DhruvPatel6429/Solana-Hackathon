import * as React from "react";
import { cn } from "@/lib/utils";

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn("h-10 w-full rounded-md border border-white/10 bg-[#15151f] px-3 text-sm text-white outline-none focus:border-violet-400", className)}
      {...props}
    >
      {children}
    </select>
  );
}
