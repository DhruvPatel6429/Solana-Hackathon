"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { useAppStore } from "@/lib/store";
import { formatUSDC } from "@/lib/utils";

type Line = { description: string; quantity: number; rate: number };

export default function NewInvoicePage() {
  const [lines, setLines] = useState<Line[]>([{ description: "AI workflow implementation", quantity: 20, rate: 210 }]);
  const [description, setDescription] = useState("");
  const pushToast = useAppStore((state) => state.pushToast);
  const total = useMemo(() => lines.reduce((sum, line) => sum + line.quantity * line.rate, 0), [lines]);

  return (
    <AppShell contractor>
      <div className="grid gap-6 px-4 py-6 md:px-8 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <p className="metric-label">New invoice</p>
          <h1 className="mt-2 text-3xl font-bold">Submit work for approval</h1>
          <div className="mt-6 space-y-4">
            <Input placeholder="Work description" value={description} onChange={(event) => setDescription(event.target.value)} />
            <div className="grid gap-3 md:grid-cols-2"><Input type="date" /><Input type="date" /></div>
            <div className="space-y-3">
              {lines.map((line, index) => (
                <div key={index} className="grid gap-3 md:grid-cols-[1fr_100px_120px_44px]">
                  <Input value={line.description} onChange={(event) => setLines(lines.map((item, i) => i === index ? { ...item, description: event.target.value } : item))} />
                  <Input type="number" value={line.quantity} onChange={(event) => setLines(lines.map((item, i) => i === index ? { ...item, quantity: Number(event.target.value) } : item))} />
                  <Input type="number" value={line.rate} onChange={(event) => setLines(lines.map((item, i) => i === index ? { ...item, rate: Number(event.target.value) } : item))} />
                  <Button size="icon" variant="ghost" onClick={() => setLines(lines.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
            <Button variant="ghost" onClick={() => setLines([...lines, { description: "", quantity: 1, rate: 100 }])}><Plus className="h-4 w-4" />Add line</Button>
            <Textarea placeholder="Notes" />
            <Button variant="ghost"><Upload className="h-4 w-4" />Attach PDF</Button>
            <Button className="w-full" onClick={() => pushToast({ type: "success", message: "Invoice submitted for approval." })}>Submit invoice</Button>
          </div>
        </Card>
        <Card>
          <p className="metric-label">Live preview</p>
          <h2 className="mt-2 text-2xl font-bold">Invoice Preview</h2>
          <p className="mt-4 text-zinc-400">{description || "Work description will appear here"}</p>
          <div className="mt-6 space-y-3">
            {lines.map((line, index) => <div key={index} className="flex justify-between border-b border-white/10 pb-3 text-sm"><span>{line.description || "Line item"}</span><span>{formatUSDC(line.quantity * line.rate)}</span></div>)}
          </div>
          <div className="mt-6 flex justify-between text-xl font-bold"><span>Total</span><span>{formatUSDC(total)}</span></div>
        </Card>
      </div>
    </AppShell>
  );
}
