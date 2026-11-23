"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  BarChart3,
  BookOpen,
  Building2,
  CheckSquare,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Settings,
  Users,
  X,
} from "lucide-react";
import QuickTransactionModal from "@/components/dashboard/QuickTransactionModal";
import { ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { CompanyRole } from "@/models/User";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: CompanyRole[];
  badge?: number;
}

export default function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [pendingBadge, setPendingBadge] = useState(0);

  const user = session?.user;
  const role: CompanyRole = user?.role || "EMPLOYEE";
  const companyName = user?.companyName || "Organization";
  const branchName = user?.branchName || "Head Office";
  const displayName =
    user?.name?.trim() || user?.email?.split("@")[0] || "Account";
  const userInitial = displayName.charAt(0).toUpperCase();
  const canApprove = role !== "EMPLOYEE";

  const loadPendingCount = useCallback(async () => {
    if (!canApprove) {
      setPendingBadge(0);
      return;
    }
    try {
      const res = await fetch("/api/approvals", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setPendingBadge(json.pendingCount || 0);
      }
    } catch {
      // ignore transient network errors
    }
  }, [canApprove]);

  useEffect(() => {
    loadPendingCount();
  }, [loadPendingCount]);

  useEffect(() => {
    const handler = () => loadPendingCount();
    window.addEventListener("korikhata:data-updated", handler);
    return () => window.removeEventListener("korikhata:data-updated", handler);
  }, [loadPendingCount]);

  const allNavItems: NavItem[] = [
    {
      href: "/",
      label: "Overview",
      icon: LayoutDashboard,
      roles: [
        "COMPANY_SUPER_ADMIN",
        "HQ_ADMIN_OFFICER",
        "BRANCH_MANAGER",
        "EMPLOYEE",
      ],
    },
    {
      href: "/approvals",
      label: "Approvals",
      icon: CheckSquare,
      roles: ["COMPANY_SUPER_ADMIN", "HQ_ADMIN_OFFICER", "BRANCH_MANAGER"],
      badge: pendingBadge,
    },
    {
      href: "/ledger",
      label: role === "EMPLOYEE" ? "My Submissions" : "Daily Ledger",
      icon: BookOpen,
      roles: [
        "COMPANY_SUPER_ADMIN",
        "HQ_ADMIN_OFFICER",
        "BRANCH_MANAGER",
        "EMPLOYEE",
      ],
    },
    {
      href: "/dues",
      label: "Dues & Credits",
      icon: Users,
      roles: ["COMPANY_SUPER_ADMIN", "HQ_ADMIN_OFFICER", "BRANCH_MANAGER"],
    },
    {
      href: "/reports",
      label: "Reports",
      icon: BarChart3,
      roles: ["COMPANY_SUPER_ADMIN", "HQ_ADMIN_OFFICER", "BRANCH_MANAGER"],
    },
    {
      href: "/team",
      label: "Branches & Team",
      icon: GitBranch,
      roles: ["COMPANY_SUPER_ADMIN", "HQ_ADMIN_OFFICER", "BRANCH_MANAGER"],
    },
    {
      href: "/settings",
      label: "Settings",
      icon: Settings,
      roles: ["COMPANY_SUPER_ADMIN", "HQ_ADMIN_OFFICER"],
    },
  ];
  const navItems = allNavItems.filter((item) => item.roles.includes(role));

  const sidebarContent = (
    <div className="flex h-full flex-col bg-[#0A192F] text-slate-200">
      {/* Brand Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/8 px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0284C7] text-sm font-bold text-white">
            ৳
          </div>
          <span className="text-sm font-semibold tracking-tight text-white">
            KoriKhata
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Static Company / Branch / Role Badge */}
      <div className="shrink-0 px-3 pt-3">
        <div className="rounded-lg border border-white/8 bg-white/4 px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#0284C7]/20 text-[#38BDF8]">
              <Building2 className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">
                {companyName}
              </p>
              <p className="truncate text-[10px] text-slate-400">
                {branchName}
              </p>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-white/6 pt-2">
            <span className="rounded bg-[#0284C7]/20 px-1.5 py-0.5 text-[10px] font-medium text-[#38BDF8]">
              {ROLE_LABELS[role]?.shortLabel || role}
            </span>
            {user?.companyCode && (
              <span className="font-mono text-[10px] text-slate-400">
                {user.companyCode}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Primary Action */}
      <div className="shrink-0 px-3 pt-3">
        <button
          type="button"
          onClick={() => {
            setMobileOpen(false);
            setQuickOpen(true);
          }}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-[#0284C7] px-3 text-xs font-semibold text-white transition hover:bg-[#0369A1]"
        >
          <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
          {role === "EMPLOYEE" ? "Submit Entry" : "New Entry"}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium transition",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
              )}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive ? "text-[#38BDF8]" : "text-slate-400"
                  )}
                />
                <span className="truncate">{item.label}</span>
              </span>
              {typeof item.badge === "number" && item.badge > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-slate-950 tabular-nums">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Single Unified User Footer */}
      <div className="mt-auto shrink-0 border-t border-white/8 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0284C7]/25 text-xs font-semibold text-[#38BDF8]">
            {userInitial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-white">
              {displayName}
            </p>
            <p className="truncate text-[11px] text-slate-400">
              {user?.employeeCode || user?.email || ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Sign out"
            aria-label="Sign out"
            className="shrink-0 rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="no-print hidden w-64 shrink-0 lg:fixed lg:inset-y-0 lg:block">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-10 w-64 max-w-[82vw]">{sidebarContent}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-xs lg:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-700 hover:bg-slate-50"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#0A192F]">
                {companyName}
              </p>
              <p className="truncate text-[10px] text-slate-500">
                {branchName}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setQuickOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-[#0284C7] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0369A1]"
          >
            <Plus className="h-3.5 w-3.5" />
            New Entry
          </button>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      <QuickTransactionModal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
      />
    </div>
  );
}
