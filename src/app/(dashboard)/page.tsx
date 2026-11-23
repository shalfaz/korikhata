"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  Plus,
  Receipt,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import QuickTransactionModal from "@/components/dashboard/QuickTransactionModal";
import ReceiptPreviewModal from "@/components/ui/ReceiptPreviewModal";
import { APPROVAL_STATUS_LABELS } from "@/lib/constants";
import { cn, formatBDT, formatDate } from "@/lib/utils";
import { ApprovalStatus } from "@/models/Transaction";
import { CompanyRole } from "@/models/User";

interface AnalyticsData {
  role: CompanyRole;
  companyName: string;
  branchName: string | null;
  branches?: Array<{ id: string; name: string; code: string }>;
  employeeSummary?: {
    submittedTodayCount: number;
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
  };
  today?: { income: number; expense: number; net: number };
  month?: { income: number; expense: number; net: number };
  totalCashInHand?: number;
  walletBalances?: Array<{
    name: string;
    type: string;
    balance: number;
    income: number;
    expense: number;
  }>;
  dailyTrend?: Array<{
    date: string;
    label: string;
    income: number;
    expense: number;
    net: number;
  }>;
  pendingSummary?: {
    myQueueCount: number;
    totalPendingCount: number;
    totalPendingAmount: number;
  };
  duesSummary?: {
    totalReceivable: number;
    totalPayable: number;
    receivableCount: number;
    payableCount: number;
  };
  recentTransactions: Array<{
    id: string;
    type: "INCOME" | "EXPENSE" | "TRANSFER";
    amount: number;
    category: string;
    wallet: { name: string; type: string };
    date: string;
    note: string;
    approvalStatus: ApprovalStatus;
    rejectionReason?: string;
    receipt: { url: string; publicId: string } | null;
    branchName?: string;
    createdByName: string;
  }>;
}

export default function DashboardOverviewPage() {
  const { data: session } = useSession();
  const role = session?.user?.role || "EMPLOYEE";
  const isEmployee = role === "EMPLOYEE";
  const isHQOrSuper =
    role === "COMPANY_SUPER_ADMIN" || role === "HQ_ADMIN_OFFICER";

  const [days, setDays] = useState<7 | 30>(7);
  const [branchId, setBranchId] = useState("ALL");
  const [chartMode, setChartMode] = useState<"area" | "bar">("area");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [quickOpen, setQuickOpen] = useState(false);
  const [previewReceipt, setPreviewReceipt] = useState<{
    url: string;
    caption: string;
  } | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (isHQOrSuper && branchId !== "ALL") {
        params.set("branchId", branchId);
      }
      const res = await fetch(`/api/analytics?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load dashboard.");
      setData(json);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load dashboard."
      );
    } finally {
      setLoading(false);
    }
  }, [days, branchId, isHQOrSuper]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    const handler = () => loadAnalytics();
    window.addEventListener("korikhata:data-updated", handler);
    return () => window.removeEventListener("korikhata:data-updated", handler);
  }, [loadAnalytics]);

  if (loading && !data) {
    return (
      <div className="flex min-h-[55vh] flex-col items-center justify-center gap-2.5 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin text-[#0284C7]" />
        <p className="text-xs font-medium">Loading financial overview...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="text-sm font-medium text-rose-700">{error}</p>
        <button
          type="button"
          onClick={loadAnalytics}
          className="mt-3 rounded-lg bg-[#0284C7] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#0369A1]"
        >
          Retry
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // EMPLOYEE PERSONAL SUBMISSION DASHBOARD (No company-wide P&L exposed)
  // ---------------------------------------------------------------------------
  if (isEmployee || data?.role === "EMPLOYEE") {
    const summary = data?.employeeSummary || {
      submittedTodayCount: 0,
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#0A192F] sm:text-2xl">
              My Submissions
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {data?.companyName}
              {data?.branchName ? ` · ${data.branchName}` : ""}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setQuickOpen(true)}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#0284C7] px-3.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#0369A1]"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            Submit Entry
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <span className="text-xs font-medium text-slate-500">
              Submitted Today
            </span>
            <p className="mt-2.5 text-2xl font-semibold text-[#0A192F] tabular-nums">
              {summary.submittedTodayCount}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                Pending Approval
              </span>
              <Clock className="h-4 w-4 text-amber-500" />
            </div>
            <p className="mt-2.5 text-2xl font-semibold text-[#0A192F] tabular-nums">
              {summary.pendingCount}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                Approved
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="mt-2.5 text-2xl font-semibold text-[#0A192F] tabular-nums">
              {summary.approvedCount}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                Rejected
              </span>
              <XCircle className="h-4 w-4 text-rose-500" />
            </div>
            <p className="mt-2.5 text-2xl font-semibold text-[#0A192F] tabular-nums">
              {summary.rejectedCount}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#0A192F]">
              Recent Submissions
            </h2>
            <Link
              href="/ledger"
              className="text-xs font-medium text-[#0284C7] hover:underline"
            >
              View all
            </Link>
          </div>

          {!data?.recentTransactions?.length ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-12 text-center">
              <Receipt className="mb-2 h-7 w-7 text-slate-300" />
              <p className="text-xs font-semibold text-slate-700">
                No entries submitted yet
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Click &quot;Submit Entry&quot; to log your daily income or
                expense with a receipt.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recentTransactions.map((tx) => {
                const st = APPROVAL_STATUS_LABELS[tx.approvalStatus];
                return (
                  <div
                    key={tx.id}
                    className="flex flex-col justify-between gap-2 py-3 sm:flex-row sm:items-center"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#0A192F]">
                          {tx.category}
                        </span>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-medium",
                            tx.approvalStatus === "FINAL_APPROVED"
                              ? "bg-emerald-50 text-emerald-700"
                              : tx.approvalStatus === "REJECTED"
                              ? "bg-rose-50 text-rose-700"
                              : "bg-amber-50 text-amber-700"
                          )}
                        >
                          {st?.label || tx.approvalStatus}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {tx.wallet.name} · {formatDate(tx.date)}
                        {tx.note ? ` · ${tx.note}` : ""}
                      </p>
                      {tx.approvalStatus === "REJECTED" &&
                        tx.rejectionReason && (
                          <p className="mt-1 text-[11px] font-medium text-rose-600">
                            Rejection reason: {tx.rejectionReason}
                          </p>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                      {tx.receipt?.url && (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewReceipt({
                              url: tx.receipt!.url,
                              caption: `${tx.category} — ${formatBDT(tx.amount)}`,
                            })
                          }
                          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-[#0284C7]"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <span
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          tx.type === "INCOME"
                            ? "text-emerald-600"
                            : "text-slate-800"
                        )}
                      >
                        {tx.type === "INCOME" ? "+" : "-"}
                        {formatBDT(tx.amount)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <QuickTransactionModal
          open={quickOpen}
          onClose={() => setQuickOpen(false)}
          onSuccess={loadAnalytics}
        />
        <ReceiptPreviewModal
          receiptUrl={previewReceipt?.url || null}
          caption={previewReceipt?.caption}
          onClose={() => setPreviewReceipt(null)}
        />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // MANAGER / HQ / COMPANY SUPER ADMIN VIEW (FINAL_APPROVED ONLY)
  // ---------------------------------------------------------------------------
  const monthNet = data?.month?.net || 0;
  const isProfit = monthNet >= 0;
  const todayNet = data?.today?.net || 0;
  const pendingSummary = data?.pendingSummary || {
    myQueueCount: 0,
    totalPendingCount: 0,
    totalPendingAmount: 0,
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#0A192F] sm:text-2xl">
            {data?.companyName || "Overview"}
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {role === "BRANCH_MANAGER"
              ? `${data?.branchName || "Branch"} verified P&L and cashflow (final-approved only)`
              : "Verified profit & loss, daily cashflow, and wallet balances (final-approved only)"}
          </p>
        </div>

        {isHQOrSuper && (data?.branches?.length || 0) > 0 && (
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 outline-none focus:border-[#0284C7]"
          >
            <option value="ALL">All Branches / Districts</option>
            {data?.branches?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Pending Approvals Callout (Kept strictly separate from real P&L) */}
      {pendingSummary.totalPendingCount > 0 && (
        <Link
          href="/approvals"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 transition hover:border-amber-300"
        >
          <div className="flex items-center gap-2.5 text-xs">
            <Clock className="h-4 w-4 shrink-0 text-amber-600" />
            <p className="font-medium text-amber-900">
              <span className="font-semibold tabular-nums">
                {pendingSummary.myQueueCount}
              </span>{" "}
              waiting at your tier ·{" "}
              <span className="tabular-nums">
                {pendingSummary.totalPendingCount}
              </span>{" "}
              total pending ({formatBDT(pendingSummary.totalPendingAmount)}) —
              excluded from live P&amp;L until final approval.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
            Review Queue <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      )}

      {/* Uniform 4-Card KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">
              Monthly Net P&amp;L
            </span>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
                isProfit
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-rose-50 text-rose-700"
              )}
            >
              {isProfit ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {isProfit ? "Profit" : "Loss"}
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-[#0A192F] tabular-nums">
            {formatBDT(monthNet)}
          </p>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11px] text-slate-500 tabular-nums">
            <span>In: {formatBDT(data?.month?.income || 0)}</span>
            <span>Out: {formatBDT(data?.month?.expense || 0)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">
              Today&apos;s Income
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
              <ArrowDownLeft className="h-3 w-3" />
              Inflow
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-[#0A192F] tabular-nums">
            {formatBDT(data?.today?.income || 0)}
          </p>
          <div className="mt-3 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500 tabular-nums">
            Net today:{" "}
            <span
              className={cn(
                "font-medium",
                todayNet >= 0 ? "text-emerald-600" : "text-rose-600"
              )}
            >
              {formatBDT(todayNet)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">
              Today&apos;s Expense
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
              <ArrowUpRight className="h-3 w-3" />
              Outflow
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-[#0A192F] tabular-nums">
            {formatBDT(data?.today?.expense || 0)}
          </p>
          <div className="mt-3 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
            Verified cash &amp; digital outflows
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">
              Total Cash &amp; Wallets
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-[#0284C7]">
              <Wallet className="h-3 w-3 shrink-0" />
              {(data?.walletBalances || []).length} active
            </span>
          </div>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-[#0A192F] tabular-nums">
            {formatBDT(data?.totalCashInHand || 0)}
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2.5">
            {(data?.walletBalances || []).map((w) => (
              <span
                key={`${w.type}-${w.name}`}
                className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 tabular-nums"
              >
                {w.name}: {formatBDT(w.balance)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Compact Receivables & Payables Strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/dues"
          className="group flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-xs transition hover:border-[#0284C7]/50"
        >
          <div className="flex items-center gap-3">
            <span className="h-8 w-1 rounded-full bg-[#0284C7]" />
            <div>
              <p className="text-xs font-medium text-slate-500">
                Receivables · {data?.duesSummary?.receivableCount || 0} open
              </p>
              <p className="mt-0.5 text-lg font-semibold text-[#0A192F] tabular-nums">
                {formatBDT(data?.duesSummary?.totalReceivable || 0)}
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[#0284C7]" />
        </Link>

        <Link
          href="/dues"
          className="group flex items-center justify-between rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-xs transition hover:border-slate-300"
        >
          <div className="flex items-center gap-3">
            <span className="h-8 w-1 rounded-full bg-amber-500" />
            <div>
              <p className="text-xs font-medium text-slate-500">
                Payables · {data?.duesSummary?.payableCount || 0} open
              </p>
              <p className="mt-0.5 text-lg font-semibold text-[#0A192F] tabular-nums">
                {formatBDT(data?.duesSummary?.totalPayable || 0)}
              </p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
        </Link>
      </div>

      {/* Cashflow Chart + Recent Transactions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs lg:col-span-2">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-[#0A192F]">
                Cashflow Overview
              </h2>
              <p className="text-xs text-slate-500">
                Approved daily income vs. expense in BDT
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => setDays(7)}
                  className={cn(
                    "rounded-md px-2.5 py-1 transition",
                    days === 7
                      ? "bg-white text-[#0A192F] shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  7D
                </button>
                <button
                  type="button"
                  onClick={() => setDays(30)}
                  className={cn(
                    "rounded-md px-2.5 py-1 transition",
                    days === 30
                      ? "bg-white text-[#0A192F] shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  30D
                </button>
              </div>

              <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => setChartMode("area")}
                  className={cn(
                    "rounded-md px-2.5 py-1 transition",
                    chartMode === "area"
                      ? "bg-white text-[#0284C7] shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  Area
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode("bar")}
                  className={cn(
                    "rounded-md px-2.5 py-1 transition",
                    chartMode === "bar"
                      ? "bg-white text-[#0284C7] shadow-xs"
                      : "text-slate-500 hover:text-slate-800"
                  )}
                >
                  Bar
                </button>
              </div>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chartMode === "area" ? (
                <AreaChart
                  data={data?.dailyTrend || []}
                  margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0284C7" stopOpacity={0.2} />
                      <stop offset="100%" stopColor="#0284C7" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F43F5E" stopOpacity={0.14} />
                      <stop offset="100%" stopColor="#F43F5E" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    stroke="#F1F5F9"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#94A3B8" }}
                    tickLine={false}
                    axisLine={false}
                    dy={6}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94A3B8" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `৳${v}`}
                  />
                  <Tooltip
                    cursor={{ stroke: "#CBD5E1", strokeDasharray: "3 3" }}
                    formatter={(value: number, name: string) => [
                      formatBDT(value),
                      name === "income" ? "Income" : "Expense",
                    ]}
                    contentStyle={{
                      backgroundColor: "rgba(255, 255, 255, 0.96)",
                      borderRadius: "10px",
                      border: "1px solid #E2E8F0",
                      boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.08)",
                      fontSize: "12px",
                      padding: "8px 12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke="#0284C7"
                    strokeWidth={2}
                    fill="url(#incomeGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="expense"
                    stroke="#F43F5E"
                    strokeWidth={2}
                    fill="url(#expenseGrad)"
                  />
                </AreaChart>
              ) : (
                <BarChart
                  data={data?.dailyTrend || []}
                  margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                >
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    stroke="#F1F5F9"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#94A3B8" }}
                    tickLine={false}
                    axisLine={false}
                    dy={6}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94A3B8" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `৳${v}`}
                  />
                  <Tooltip
                    cursor={{ fill: "#F8FAFC" }}
                    formatter={(value: number, name: string) => [
                      formatBDT(value),
                      name === "income" ? "Income" : "Expense",
                    ]}
                    contentStyle={{
                      backgroundColor: "rgba(255, 255, 255, 0.96)",
                      borderRadius: "10px",
                      border: "1px solid #E2E8F0",
                      boxShadow: "0 10px 25px -5px rgba(15, 23, 42, 0.08)",
                      fontSize: "12px",
                      padding: "8px 12px",
                    }}
                  />
                  <Bar
                    dataKey="income"
                    fill="#0284C7"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={24}
                  />
                  <Bar
                    dataKey="expense"
                    fill="#F43F5E"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={24}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[#0A192F]">
                Recent Activity
              </h2>
              <p className="text-xs text-slate-500">Latest ledger entries</p>
            </div>
            <Link
              href="/ledger"
              className="text-xs font-medium text-[#0284C7] hover:text-[#0369A1] hover:underline"
            >
              View all
            </Link>
          </div>

          {!data?.recentTransactions?.length ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 py-12 text-center">
              <Receipt className="mb-2 h-7 w-7 text-slate-300" />
              <p className="text-xs font-semibold text-slate-700">
                No transactions yet
              </p>
              <p className="mt-1 max-w-50 text-[11px] text-slate-500">
                Record your first income or expense to populate live analytics.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.recentTransactions.map((tx) => {
                const statusMeta = APPROVAL_STATUS_LABELS[tx.approvalStatus];
                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            tx.type === "INCOME"
                              ? "bg-emerald-500"
                              : "bg-rose-500"
                          )}
                        />
                        <p className="truncate text-xs font-medium text-slate-800">
                          {tx.category}
                        </p>
                      </div>
                      <p className="mt-0.5 truncate pl-3 text-[11px] text-slate-400">
                        {tx.branchName ? `${tx.branchName} · ` : ""}
                        {formatDate(tx.date)} ·{" "}
                        <span
                          className={cn(
                            tx.approvalStatus === "FINAL_APPROVED"
                              ? "text-emerald-600"
                              : tx.approvalStatus === "REJECTED"
                              ? "text-rose-600"
                              : "text-amber-600"
                          )}
                        >
                          {statusMeta?.label || tx.approvalStatus}
                        </span>
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {tx.receipt?.url && (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewReceipt({
                              url: tx.receipt!.url,
                              caption: `${tx.category} — ${formatBDT(tx.amount)}`,
                            })
                          }
                          title="View receipt"
                          className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-[#0284C7]"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <span
                        className={cn(
                          "text-xs font-semibold tabular-nums",
                          tx.type === "INCOME"
                            ? "text-emerald-600"
                            : "text-slate-800"
                        )}
                      >
                        {tx.type === "INCOME" ? "+" : "-"}
                        {formatBDT(tx.amount)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <QuickTransactionModal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onSuccess={loadAnalytics}
      />

      <ReceiptPreviewModal
        receiptUrl={previewReceipt?.url || null}
        caption={previewReceipt?.caption}
        onClose={() => setPreviewReceipt(null)}
      />
    </div>
  );
}
