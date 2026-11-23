"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Printer } from "lucide-react";
import { cn, formatBDT, formatDate, toDateInputValue } from "@/lib/utils";

interface CategoryRow {
  category: string;
  total: number;
  count: number;
}

interface ReportAnalytics {
  companyName: string;
  period: { income: number; expense: number; net: number; count: number };
  categoryBreakdown: {
    income: CategoryRow[];
    expense: CategoryRow[];
  };
  walletBalances: Array<{ name: string; type: string; balance: number }>;
}

export default function ReportsPage() {
  const now = new Date();
  const defaultStart = toDateInputValue(
    new Date(now.getFullYear(), now.getMonth(), 1)
  );
  const defaultEnd = toDateInputValue(
    new Date(now.getFullYear(), now.getMonth() + 1, 0)
  );

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [data, setData] = useState<ReportAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await fetch(`/api/analytics?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  async function handleExportCSV() {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        startDate,
        endDate,
        limit: "500",
      });
      const res = await fetch(`/api/transactions?${params.toString()}`);
      const json = await res.json();
      const rows = (json.transactions || []) as Array<{
        date: string;
        type: string;
        category: string;
        wallet: { name: string };
        amount: number;
        note: string;
        createdByName: string;
      }>;

      const escapeCsv = (val: string | number) =>
        `"${String(val).replace(/"/g, '""')}"`;

      const header = [
        "Date",
        "Type",
        "Category",
        "Wallet",
        "Amount (BDT)",
        "Note",
        "Recorded By",
      ];

      const lines = [
        header.join(","),
        ...rows.map((r) =>
          [
            escapeCsv(formatDate(r.date)),
            escapeCsv(r.type),
            escapeCsv(r.category),
            escapeCsv(r.wallet.name),
            escapeCsv(r.amount),
            escapeCsv(r.note || ""),
            escapeCsv(r.createdByName || ""),
          ].join(",")
        ),
      ];

      const blob = new Blob([lines.join("\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `KoriKhata_PnL_${startDate}_to_${endDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const income = data?.period.income || 0;
  const expense = data?.period.expense || 0;
  const net = data?.period.net || 0;
  const margin = income > 0 ? ((net / income) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="no-print flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0A192F]">
            Profit &amp; Loss Report (লাভ-ক্ষতি বিবরণী)
          </h1>
          <p className="text-sm text-slate-500">
            Plain-language financial summary ready for partners, banks, or print
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={exporting}
            onClick={handleExportCSV}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0284C7] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0369A1] disabled:opacity-60"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Print / PDF
          </button>
        </div>
      </div>

      {/* Date Range Picker */}
      <div className="no-print flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
            From Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
            To Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
          />
        </div>
      </div>

      {/* Printable Statement */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-[#0284C7]" />
          Generating P&amp;L statement...
        </div>
      ) : (
        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          {/* Statement Title */}
          <div className="flex flex-col justify-between gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#0284C7]">
                KoriKhata Financial Statement
              </p>
              <h2 className="text-xl font-bold text-[#0A192F]">
                {data?.companyName} — Profit &amp; Loss
              </h2>
            </div>
            <p className="text-xs font-medium text-slate-500">
              Period: {formatDate(startDate)} — {formatDate(endDate)}
            </p>
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <p className="text-xs font-semibold uppercase text-emerald-700">
                Total Income (মোট আয়)
              </p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-700">
                {formatBDT(income)}
              </p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
              <p className="text-xs font-semibold uppercase text-rose-700">
                Total Expense (মোট ব্যয়)
              </p>
              <p className="mt-1 text-2xl font-extrabold text-rose-700">
                {formatBDT(expense)}
              </p>
            </div>
            <div
              className={cn(
                "rounded-xl border p-4",
                net >= 0
                  ? "border-sky-200 bg-[#0A192F] text-white"
                  : "border-rose-300 bg-rose-700 text-white"
              )}
            >
              <p className="text-xs font-semibold uppercase text-sky-300">
                Net {net >= 0 ? "Profit (নিট লাভ)" : "Loss (নিট ক্ষতি)"}
              </p>
              <p className="mt-1 text-2xl font-extrabold">{formatBDT(net)}</p>
              <p className="mt-1 text-xs text-sky-200">
                Profit Margin: {margin}%
              </p>
            </div>
          </div>

          {/* Category Breakdowns */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-emerald-700">
                Income Breakdown (আয়ের খাত)
              </h3>
              {!data?.categoryBreakdown.income.length ? (
                <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
                  No income recorded in this period.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {data.categoryBreakdown.income.map((row) => (
                    <div
                      key={row.category}
                      className="flex items-center justify-between px-4 py-2.5 text-sm"
                    >
                      <div>
                        <span className="font-medium text-slate-800">
                          {row.category}
                        </span>
                        <span className="ml-2 text-xs text-slate-400">
                          ({row.count})
                        </span>
                      </div>
                      <span className="font-bold text-emerald-700">
                        {formatBDT(row.total)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-rose-700">
                Expense Breakdown (ব্যয়ের খাত)
              </h3>
              {!data?.categoryBreakdown.expense.length ? (
                <p className="rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
                  No expenses recorded in this period.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {data.categoryBreakdown.expense.map((row) => (
                    <div
                      key={row.category}
                      className="flex items-center justify-between px-4 py-2.5 text-sm"
                    >
                      <div>
                        <span className="font-medium text-slate-800">
                          {row.category}
                        </span>
                        <span className="ml-2 text-xs text-slate-400">
                          ({row.count})
                        </span>
                      </div>
                      <span className="font-bold text-rose-700">
                        {formatBDT(row.total)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
