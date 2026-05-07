import { cn } from "@/lib/utils";

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

  return (
    <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-100 ring-1 ring-violet-400/30", className)}>
      {initials}
    </div>
  );
}
