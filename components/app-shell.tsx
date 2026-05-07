"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardCheck, FileText, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, Users, WalletCards, Zap } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard#contractors", label: "Contractors", icon: Users },
  { href: "/dashboard#invoices", label: "Invoices", icon: FileText },
  { href: "/dashboard#payouts", label: "Payouts", icon: Zap },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck },
  { href: "/onboarding", label: "Settings", icon: Settings },
];

export function AppShell({ children, contractor = false }: { children: React.ReactNode; contractor?: boolean }) {
  const pathname = usePathname();
  const collapsed = useAppStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);

  const links = contractor
    ? [
        { href: "/contractor", label: "Home", icon: LayoutDashboard },
        { href: "/contractor/invoices/new", label: "Invoice", icon: ClipboardCheck },
        { href: "/compliance", label: "History", icon: WalletCards },
      ]
    : nav;

  return (
    <div className="min-h-screen md:flex">
      <aside
        className={cn(
          "fixed left-0 top-0 z-30 hidden h-screen border-r border-white/10 bg-[#0d0d14]/95 p-4 backdrop-blur md:flex md:flex-col",
          collapsed ? "w-20" : "w-60",
        )}
      >
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-violet-600 shadow-lg shadow-violet-900/50">B</div>
          {!collapsed && <span className="text-lg font-bold">Borderless</span>}
        </div>
        <Button variant="ghost" size="icon" className="absolute right-3 top-4" onClick={toggleSidebar} aria-label="Toggle sidebar">
          <Menu className="h-4 w-4" />
        </Button>
        <nav className="flex flex-1 flex-col gap-2">
          {links.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white", active && "bg-violet-500/15 text-violet-100")}>
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 pt-4">
          <div className="mb-3 flex items-center gap-3">
            <Avatar name={contractor ? "Maya Chen" : "Dhruv Patel"} />
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{contractor ? "Maya Chen" : "Dhruv Patel"}</p>
                <Badge tone="violet">Growth</Badge>
              </div>
            )}
          </div>
          <Button variant="ghost" className="w-full justify-start" size="sm">
            <LogOut className="h-4 w-4" />
            {!collapsed && "Logout"}
          </Button>
        </div>
      </aside>
      <main className={cn("min-h-screen flex-1 pb-24 md:pb-0", collapsed ? "md:ml-20" : "md:ml-60")}>{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t border-white/10 bg-[#0d0d14]/95 p-2 backdrop-blur md:hidden">
        {links.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="grid place-items-center gap-1 rounded py-2 text-[11px] text-zinc-400">
              <Icon className="h-4 w-4" />
              {item.label.split(" ")[0]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
