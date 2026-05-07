import { cn } from "@/lib/utils";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "violet" | "emerald" | "amber" | "red" | "blue" | "zinc";
};

export function Badge({ className, tone = "zinc", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        tone === "violet" && "border-violet-400/30 bg-violet-500/10 text-violet-200",
        tone === "emerald" && "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
        tone === "amber" && "border-amber-400/30 bg-amber-500/10 text-amber-200",
        tone === "red" && "border-red-400/30 bg-red-500/10 text-red-200",
        tone === "blue" && "border-sky-400/30 bg-sky-500/10 text-sky-200",
        tone === "zinc" && "border-zinc-600 bg-zinc-800/70 text-zinc-200",
        className,
      )}
      {...props}
    />
  );
}
