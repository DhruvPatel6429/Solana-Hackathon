import { FileSearch } from "lucide-react";

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid place-items-center rounded-lg border border-dashed border-white/10 bg-zinc-900 p-10 text-center">
      <div className="mb-4 grid h-16 w-16 place-items-center rounded-full bg-violet-500/10 text-violet-200">
        <FileSearch className="h-8 w-8" />
      </div>
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-zinc-400">{description}</p>
    </div>
  );
}
