"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  Loader2,
  X,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import ReceiptPreviewModal from "@/components/ui/ReceiptPreviewModal";
import { APPROVAL_STATUS_LABELS, ROLE_LABELS } from "@/lib/constants";
import { cn, formatBDT, formatDate, formatDateTime } from "@/lib/utils";
import { ApprovalStatus } from "@/models/Transaction";
import { CompanyRole } from "@/models/User";

interface ApprovalItem {
  id: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: number;
  category: string;
  wallet: { name: string; type: string };
  date: string;
  note: string;
  receipt: { url: string; publicId: string } | null;
  approvalStatus: ApprovalStatus;
  approvalHistory: Array<{
    actorName: string;
    role: CompanyRole;
    action: string;
    note: string;
    timestamp: string;
  }>;
  branch: { id: string; name: string; code: string } | null;
  submittedBy: { name: string; employeeCode: string; email: string };
  createdAt: string;
}

export default function ApprovalsQueuePage() {
  const { data: session } = useSession();
  const role = session?.user?.role || "EMPLOYEE";
  const isSuperAdmin = role === "COMPANY_SUPER_ADMIN";

  const [scope, setScope] = useState<"mine" | "all_pending">("mine");
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [previewReceipt, setPreviewReceipt] = useState<{
    url: string;
    caption: string;
  } | null>(null);

  // Reject Modal
  const [rejectTarget, setRejectTarget] = useState<ApprovalItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/approvals?scope=${scope}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load queue.");
      setItems(json.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load queue.");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  async function handleApprove(item: ApprovalItem) {
    setProcessingId(item.id);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${item.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVE" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Approval failed.");

      setNotice(json.message || "Entry approved.");
      window.dispatchEvent(new CustomEvent("korikhata:data-updated"));
      loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not approve entry.");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleRejectSubmit(e: FormEvent) {
    e.preventDefault();
    if (!rejectTarget) return;
    setRejecting(true);
    setError(null);
    try {
      const res = await fetch(`/api/transactions/${rejectTarget.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REJECT",
          note: rejectReason.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Rejection failed.");

      setRejectTarget(null);
      setRejectReason("");
      setNotice("Entry rejected and submitter notified.");
      window.dispatchEvent(new CustomEvent("korikhata:data-updated"));
      loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reject entry.");
    } finally {
      setRejecting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#0A192F] sm:text-2xl">
            Approval Queue
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            Review receipts and verify pending transactions before they post to
            live P&amp;L
          </p>
        </div>

        {isSuperAdmin && (
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setScope("mine")}
              className={cn(
                "rounded-md px-3 py-1.5 transition",
                scope === "mine"
                  ? "bg-[#0A192F] text-white"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              Final Approval Queue
            </button>
            <button
              type="button"
              onClick={() => setScope("all_pending")}
              className={cn(
                "rounded-md px-3 py-1.5 transition",
                scope === "all_pending"
                  ? "bg-[#0A192F] text-white"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              All Pending Tiers
            </button>
          </div>
        )}
      </div>

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-[#0284C7]" />
          Loading pending queue...
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <CheckCircle2 className="mb-2.5 h-9 w-9 text-emerald-500" />
          <p className="text-sm font-semibold text-[#0A192F]">
            All caught up
          </p>
          <p className="mt-1 text-xs text-slate-500">
            No pending transactions require your approval right now.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const statusMeta = APPROVAL_STATUS_LABELS[item.approvalStatus];
            const isBusy = processingId === item.id;

            return (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs"
              >
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          item.type === "INCOME"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        )}
                      >
                        {item.type === "INCOME" ? (
                          <ArrowDownLeft className="h-3 w-3" />
                        ) : (
                          <ArrowUpRight className="h-3 w-3" />
                        )}
                        {item.type}
                      </span>
                      <span className="text-sm font-semibold text-[#0A192F]">
                        {item.category}
                      </span>
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        {statusMeta?.label || item.approvalStatus}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">
                        {item.submittedBy.name}
                        {item.submittedBy.employeeCode
                          ? ` (${item.submittedBy.employeeCode})`
                          : ""}
                      </span>
                      {item.branch && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-slate-400" />
                          {item.branch.name}
                        </span>
                      )}
                      <span>{item.wallet.name}</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3 text-slate-400" />
                        {formatDate(item.date)}
                      </span>
                    </div>

                    {item.note && (
                      <p className="text-xs text-slate-600">{item.note}</p>
                    )}

                    {/* Compact Approval Trail */}
                    {item.approvalHistory.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {item.approvalHistory.map((h, i) => (
                          <span
                            key={i}
                            className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600"
                          >
                            {h.action} by {h.actorName} (
                            {ROLE_LABELS[h.role]?.shortLabel || h.role}) ·{" "}
                            {formatDateTime(h.timestamp)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Amount & Decision Buttons */}
                  <div className="flex flex-wrap items-center gap-2.5 lg:justify-end">
                    <p
                      className={cn(
                        "mr-2 text-lg font-semibold tabular-nums",
                        item.type === "INCOME"
                          ? "text-emerald-600"
                          : "text-[#0A192F]"
                      )}
                    >
                      {item.type === "INCOME" ? "+" : "-"}
                      {formatBDT(item.amount)}
                    </p>

                    {item.receipt?.url && (
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewReceipt({
                            url: item.receipt!.url,
                            caption: `${item.category} — ${formatBDT(item.amount)}`,
                          })
                        }
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Eye className="h-3.5 w-3.5 text-[#0284C7]" />
                        Receipt
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setRejectTarget(item);
                        setRejectReason("");
                      }}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      Reject
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleApprove(item)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#0284C7] px-3.5 text-xs font-semibold text-white transition hover:bg-[#0369A1] disabled:opacity-50"
                    >
                      {isBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      {isSuperAdmin ? "Final Approve" : "Approve"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ReceiptPreviewModal
        receiptUrl={previewReceipt?.url || null}
        caption={previewReceipt?.caption}
        onClose={() => setPreviewReceipt(null)}
      />

      <Modal
        open={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="Reject Transaction"
        subtitle="Provide a clear reason so the submitter knows what to fix"
      >
        {rejectTarget && (
          <form onSubmit={handleRejectSubmit} className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-semibold text-[#0A192F]">
                {rejectTarget.category} · {formatBDT(rejectTarget.amount)}
              </p>
              <p className="mt-0.5">
                Submitted by {rejectTarget.submittedBy.name}
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-700">
                Rejection Reason *
              </label>
              <textarea
                required
                minLength={3}
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g., Missing cash memo photo or amount mismatch"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={rejecting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                {rejecting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirm Rejection
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
