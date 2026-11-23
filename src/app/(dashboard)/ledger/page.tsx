"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import QuickTransactionModal from "@/components/dashboard/QuickTransactionModal";
import Modal from "@/components/ui/Modal";
import ReceiptPreviewModal from "@/components/ui/ReceiptPreviewModal";
import {
  APPROVAL_STATUS_LABELS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
} from "@/lib/constants";
import { cn, formatBDT, formatDate, toDateInputValue } from "@/lib/utils";
import { ApprovalStatus } from "@/models/Transaction";

interface LedgerTx {
  id: string;
  voucherNo?: string;
  referenceNo?: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: number;
  category: string;
  wallet: { name: string; type: string };
  destinationWallet?: { name: string; type: string } | null;
  date: string;
  note: string;
  approvalStatus: ApprovalStatus;
  rejectionReason?: string;
  branch: { id: string; name: string; code: string } | null;
  receipt: { url: string; publicId: string } | null;
  createdByName: string;
}

export default function DailyLedgerPage() {
  const { data: session } = useSession();
  const role = session?.user?.role || "EMPLOYEE";
  const isEmployee = role === "EMPLOYEE";
  const canEdit =
    role === "COMPANY_SUPER_ADMIN" || role === "HQ_ADMIN";
  const canDelete = role === "COMPANY_SUPER_ADMIN";

  const [transactions, setTransactions] = useState<LedgerTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [quickOpen, setQuickOpen] = useState(false);
  const [previewReceipt, setPreviewReceipt] = useState<{
    url: string;
    caption: string;
  } | null>(null);

  const [editingTx, setEditingTx] = useState<LedgerTx | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNote, setEditNote] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== "ALL") params.set("type", typeFilter);
      if (statusFilter !== "ALL") params.set("approvalStatus", statusFilter);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/transactions?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load ledger.");
      setTransactions(json.transactions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load ledger.");
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, startDate, endDate, search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadTransactions();
    }, 200);
    return () => clearTimeout(timer);
  }, [loadTransactions]);

  useEffect(() => {
    const handler = () => loadTransactions();
    window.addEventListener("korikhata:data-updated", handler);
    return () => window.removeEventListener("korikhata:data-updated", handler);
  }, [loadTransactions]);

  function openEditModal(tx: LedgerTx) {
    setEditingTx(tx);
    setEditAmount(String(tx.amount));
    setEditCategory(tx.category);
    setEditDate(toDateInputValue(new Date(tx.date)));
    setEditNote(tx.note || "");
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingTx) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/transactions/${editingTx.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(editAmount),
          category: editCategory,
          date: editDate,
          note: editNote,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update.");
      setEditingTx(null);
      loadTransactions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not update entry.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(tx: LedgerTx) {
    const confirmed = window.confirm(
      `Delete ${tx.type} of ${formatBDT(tx.amount)} (${tx.category})? This action is logged in the Audit Trail.`
    );
    if (!confirmed) return;

    setDeletingId(tx.id);
    try {
      const res = await fetch(`/api/transactions/${tx.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete.");
      loadTransactions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not delete entry.");
    } finally {
      setDeletingId(null);
    }
  }

  const approvedIncome = transactions
    .filter((t) => t.type === "INCOME" && t.approvalStatus === "FINAL_APPROVED")
    .reduce((acc, t) => acc + t.amount, 0);
  const approvedExpense = transactions
    .filter(
      (t) => t.type === "EXPENSE" && t.approvalStatus === "FINAL_APPROVED"
    )
    .reduce((acc, t) => acc + t.amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#0A192F] sm:text-2xl">
            {isEmployee ? "My Submissions" : "Daily Ledger"}
          </h1>
          <p className="text-xs text-slate-500">
            Track daily income &amp; expenses with receipt inspection and
            approval status
          </p>
        </div>
        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#0284C7] px-3.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#0369A1]"
        >
          <Plus className="h-3.5 w-3.5" />
          {isEmployee ? "Submit Entry" : "New Entry"}
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs md:grid-cols-5">
        <div className="relative md:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes, category, wallet..."
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#0284C7]"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-[#0284C7]"
        >
          <option value="ALL">All Types</option>
          <option value="INCOME">Income</option>
          <option value="EXPENSE">Expense</option>
          <option value="TRANSFER">Transfer</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-[#0284C7]"
        >
          <option value="ALL">All Statuses</option>
          <option value="PENDING">Pending Approval</option>
          <option value="FINAL_APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>

        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label="Start date"
            className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs outline-none focus:border-[#0284C7]"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-label="End date"
            className="w-full rounded-lg border border-slate-200 px-2 py-2 text-xs outline-none focus:border-[#0284C7]"
          />
        </div>
      </div>

      {!isEmployee && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-xs">
            <p className="text-[11px] font-medium text-slate-500">
              Approved Income
            </p>
            <p className="mt-0.5 text-lg font-semibold text-emerald-600 tabular-nums">
              {formatBDT(approvedIncome)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-xs">
            <p className="text-[11px] font-medium text-slate-500">
              Approved Expense
            </p>
            <p className="mt-0.5 text-lg font-semibold text-rose-600 tabular-nums">
              {formatBDT(approvedExpense)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-xs">
            <p className="text-[11px] font-medium text-slate-500">
              Verified Net
            </p>
            <p className="mt-0.5 text-lg font-semibold text-[#0A192F] tabular-nums">
              {formatBDT(approvedIncome - approvedExpense)}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-[#0284C7]" />
            Loading entries...
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-rose-600">{error}</div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <BookOpen className="mb-2 h-8 w-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">
              No matching entries
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Adjust your filters or submit a new daily entry.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Category &amp; Note</th>
                  <th className="px-4 py-3">Branch / Wallet</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((tx) => {
                  const statusMeta = APPROVAL_STATUS_LABELS[tx.approvalStatus];
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        <p>{formatDate(tx.date)}</p>
                        {tx.voucherNo && (
                          <p className="font-mono text-[10px] text-slate-400">
                            {tx.voucherNo}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                            tx.type === "INCOME"
                              ? "bg-emerald-50 text-emerald-700"
                              : tx.type === "TRANSFER"
                              ? "bg-sky-50 text-[#0369A1]"
                              : "bg-rose-50 text-rose-700"
                          )}
                        >
                          {tx.type === "INCOME" ? (
                            <ArrowDownLeft className="h-3 w-3" />
                          ) : (
                            <ArrowUpRight className="h-3 w-3" />
                          )}
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#0A192F]">
                          {tx.category}
                          {tx.referenceNo && (
                            <span className="ml-1.5 font-mono text-[10px] font-normal text-slate-400">
                              #{tx.referenceNo}
                            </span>
                          )}
                        </p>
                        {tx.note && (
                          <p className="mt-0.5 max-w-xs truncate text-[11px] text-slate-500">
                            {tx.note}
                          </p>
                        )}
                        {tx.approvalStatus === "REJECTED" &&
                          tx.rejectionReason && (
                            <p className="mt-0.5 text-[11px] font-medium text-rose-600">
                              Reason: {tx.rejectionReason}
                            </p>
                          )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <p className="font-medium text-slate-700">
                          {tx.branch?.name || "Head Office"}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {tx.type === "TRANSFER" && tx.destinationWallet
                            ? `${tx.wallet.name} → ${tx.destinationWallet.name}`
                            : tx.wallet.name}{" "}
                          · {tx.createdByName}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-medium",
                            tx.approvalStatus === "FINAL_APPROVED"
                              ? "bg-emerald-50 text-emerald-700"
                              : tx.approvalStatus === "REJECTED"
                              ? "bg-rose-50 text-rose-700"
                              : "bg-amber-50 text-amber-700"
                          )}
                        >
                          {statusMeta?.label || tx.approvalStatus}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums",
                          tx.type === "INCOME"
                            ? "text-emerald-600"
                            : tx.type === "TRANSFER"
                            ? "text-[#0284C7]"
                            : "text-slate-900"
                        )}
                      >
                        {tx.type === "INCOME"
                          ? "+"
                          : tx.type === "TRANSFER"
                          ? "⇄ "
                          : "-"}
                        {formatBDT(tx.amount)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          {tx.receipt?.url && (
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewReceipt({
                                  url: tx.receipt!.url,
                                  caption: `${tx.category} — ${formatBDT(tx.amount)}`,
                                })
                              }
                              className="rounded-md p-1.5 text-[#0284C7] hover:bg-sky-50"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openEditModal(tx)}
                              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              disabled={deletingId === tx.id}
                              onClick={() => handleDelete(tx)}
                              className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50"
                            >
                              {deletingId === tx.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <QuickTransactionModal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onSuccess={loadTransactions}
      />

      <ReceiptPreviewModal
        receiptUrl={previewReceipt?.url || null}
        caption={previewReceipt?.caption}
        onClose={() => setPreviewReceipt(null)}
      />

      <Modal
        open={Boolean(editingTx)}
        onClose={() => setEditingTx(null)}
        title="Edit Ledger Entry"
        subtitle="Edits are permanently recorded in the Audit Trail"
      >
        {editingTx && (
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Amount (৳)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-base font-semibold outline-none focus:border-[#0284C7]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Category
                </label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
                >
                  {(editingTx.type === "INCOME"
                    ? INCOME_CATEGORIES
                    : EXPENSE_CATEGORIES
                  ).map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Note
              </label>
              <input
                type="text"
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0284C7] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0369A1] disabled:opacity-60"
              >
                {savingEdit && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save Changes
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
