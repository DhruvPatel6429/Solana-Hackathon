"use client";

import { AnimatePresence, motion } from "@/components/framer-motion-lite";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const icons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

export function ToastViewport() {
  const { toasts, dismissToast } = useAppStore();

  useEffect(() => {
    const timers = toasts.map((toast) => setTimeout(() => dismissToast(toast.id), 4200));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismissToast]);

  return (
    <div className="fixed bottom-5 right-5 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-3">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = icons[toast.type];
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              className={cn(
                "glass-panel flex items-center gap-3 rounded-lg px-4 py-3 text-sm shadow-2xl",
                toast.type === "success" && "text-emerald-200",
                toast.type === "error" && "text-red-200",
                toast.type === "info" && "text-violet-200",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{toast.message}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
