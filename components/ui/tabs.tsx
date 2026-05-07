"use client";

import { cn } from "@/lib/utils";

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-white/10 bg-white/5 p-1">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={cn(
            "rounded px-3 py-1.5 text-sm text-zinc-400 transition",
            value === tab && "bg-violet-600 text-white shadow-lg shadow-violet-950/40",
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
