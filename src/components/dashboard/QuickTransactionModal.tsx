"use client";

import { FormEvent, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Hash,
  ImagePlus,
  Loader2,
  Lock,
  Trash2,
  UploadCloud,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/constants";
import { cn, formatBDT, toDateInputValue } from "@/lib/utils";
import { WalletType } from "@/models/Company";
import { TransactionType } from "@/models/Transaction";

interface WalletOption {
  id: string;
  name: string;
  type: WalletType;
  balance?: number;
}

interface BranchOption {
  id: string;
  name: string;
  code: string;
}

interface ContactOption {
  id: string;
  name: string;
  role: string;
}

interface QuickTransactionModalProps {
  open: boolean;
  onClose: () => void;
  defaultType?: TransactionType;
  onSuccess?: () => void;
}

const RECEIPT_REQUIRED_THRESHOLD = 2000;

const FALLBACK_WALLETS: WalletOption[] = [
  { id: "cash", name: "Cash in Hand", type: "CASH", balance: 0 },
  { id: "bkash", name: "bKash", type: "BKASH", balance: 0 },
  { id: "nagad", name: "Nagad", type: "NAGAD", balance: 0 },
  { id: "bank", name: "Bank Account", type: "BANK", balance: 0 },
];

export default function QuickTransactionModal({
  open,
  onClose,
  defaultType = "INCOME",
  onSuccess,
}: QuickTransactionModalProps) {
  const { data: session } = useSession();
  const role = session?.user?.role || "EMPLOYEE";
  const canPickBranch =
    role === "COMPANY_SUPER_ADMIN" || role === "HQ_ADMIN_OFFICER";
  const assignedBranchName = session?.user?.branchName || "Head Office";

  const [type, setType] = useState<TransactionType>(defaultType);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(INCOME_CATEGORIES[0].value);

  // Branch / Cost Center
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");

  // Wallets with live verified balances
  const [wallets, setWallets] = useState<WalletOption[]>(FALLBACK_WALLETS);
  const [sourceWalletIdx, setSourceWalletIdx] = useState(0);
  const [destWalletIdx, setDestWalletIdx] = useState(1);

  // Party & Reference
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [contactId, setContactId] = useState("");
  const [referenceNo, setReferenceNo] = useState("");

  const [date, setDate] = useState(toDateInputValue());
  const [note, setNote] = useState("");

  // Receipt upload
  const [receipt, setReceipt] = useState<{
    url: string;
    publicId: string;
    format?: string;
    bytes?: number;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voucher confirmation toast (persists briefly after modal closes)
  const [toast, setToast] = useState<{
    voucherNo: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!open) return;

    setType(defaultType);
    setCategory(
      defaultType === "EXPENSE"
        ? EXPENSE_CATEGORIES[0].value
        : INCOME_CATEGORIES[0].value
    );
    setDate(toDateInputValue());
    setError(null);

    Promise.all([
      fetch("/api/companies", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch("/api/analytics", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch("/api/branches", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch("/api/contacts?tab=all", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([compData, analyticsData, branchData, contactData]) => {
      const balanceLookup = new Map<string, number>();
      if (Array.isArray(analyticsData?.walletBalances)) {
        for (const wb of analyticsData.walletBalances) {
          balanceLookup.set(`${wb.type}::${wb.name}`, wb.balance ?? 0);
        }
      }

      if (compData?.company?.wallets?.length) {
        const merged: WalletOption[] = compData.company.wallets.map(
          (w: { id: string; name: string; type: WalletType }) => ({
            id: w.id,
            name: w.name,
            type: w.type,
            balance: balanceLookup.get(`${w.type}::${w.name}`),
          })
        );
        setWallets(merged);
        setSourceWalletIdx(0);
        setDestWalletIdx(merged.length > 1 ? 1 : 0);
      }

      if (Array.isArray(branchData?.branches)) {
        setBranches(branchData.branches);
        if (session?.user?.branchId) {
          setSelectedBranchId(session.user.branchId);
        } else if (branchData.branches.length > 0) {
          setSelectedBranchId(branchData.branches[0].id);
        }
      }

      if (Array.isArray(contactData?.contacts)) {
        setContacts(contactData.contacts);
      }
    });
  }, [open, defaultType, session?.user?.branchId]);

  const numericAmount = Number(amount) || 0;
  const isReceiptRequired =
    type === "EXPENSE" && numericAmount > RECEIPT_REQUIRED_THRESHOLD;

  function handleTypeSwitch(nextType: TransactionType) {
    setType(nextType);
    setError(null);
    if (nextType === "INCOME") {
      setCategory(INCOME_CATEGORIES[0].value);
    } else if (nextType === "EXPENSE") {
      setCategory(EXPENSE_CATEGORIES[0].value);
    } else {
      setCategory("Internal Transfer");
      if (sourceWalletIdx === destWalletIdx && wallets.length > 1) {
        setDestWalletIdx((sourceWalletIdx + 1) % wallets.length);
      }
    }
  }

  async function handleFileUpload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload receipt image.");
      }
      setReceipt({
        url: data.secure_url,
        publicId: data.public_id,
        format: data.format,
        bytes: data.bytes,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not upload receipt."
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!numericAmount || numericAmount <= 0) {
      setError("Please enter a valid amount greater than ৳ 0.");
      return;
    }

    if (isReceiptRequired && !receipt?.url) {
      setError(
        `A receipt / cash memo photo is required for expenses above ${formatBDT(RECEIPT_REQUIRED_THRESHOLD)}.`
      );
      return;
    }

    const sourceWallet = wallets[sourceWalletIdx] || FALLBACK_WALLETS[0];
    const destWallet = wallets[destWalletIdx] || FALLBACK_WALLETS[1];

    if (
      type === "TRANSFER" &&
      sourceWallet.type === destWallet.type &&
      sourceWallet.name === destWallet.name
    ) {
      setError("Please choose two different wallets for an internal transfer.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          amount: numericAmount,
          category: type === "TRANSFER" ? "Internal Transfer" : category,
          walletId: sourceWallet.id,
          walletName: sourceWallet.name,
          walletType: sourceWallet.type,
          ...(type === "TRANSFER"
            ? {
                destinationWalletId: destWallet.id,
                destinationWalletName: destWallet.name,
                destinationWalletType: destWallet.type,
              }
            : {}),
          branchId: canPickBranch ? selectedBranchId || undefined : undefined,
          contactId:
            type !== "TRANSFER" && contactId ? contactId : undefined,
          referenceNo: referenceNo.trim() || undefined,
          date,
          note: note.trim() || undefined,
          receipt: receipt || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save voucher.");
      }

      setAmount("");
      setNote("");
      setReferenceNo("");
      setContactId("");
      setReceipt(null);
      setToast({
        voucherNo: data.voucherNo || "VCH",
        message: data.message || "Voucher recorded.",
      });
      window.dispatchEvent(new CustomEvent("korikhata:data-updated"));
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save voucher.");
    } finally {
      setSubmitting(false);
    }
  }

  const categories =
    type === "EXPENSE" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="New Accounting Voucher"
        subtitle="Auto-numbered ERP entry with branch cost-center & receipt compliance"
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 1. Branch / Cost Center Bar */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <Building2 className="h-3.5 w-3.5 text-[#0284C7]" />
              <span>Branch / Cost Center</span>
            </div>

            {canPickBranch && branches.length > 0 ? (
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="max-w-56 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-[#0A192F] outline-none focus:border-[#0284C7]"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-[#0A192F] ring-1 ring-slate-200">
                <Lock className="h-3 w-3 text-slate-400" />
                {assignedBranchName}
              </span>
            )}
          </div>

          {/* 2. Three-Tab Mode Selector: Income / Expense / Transfer */}
          <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => handleTypeSwitch("INCOME")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition",
                type === "INCOME"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <ArrowDownLeft className="h-3.5 w-3.5" />
              Income (আয়)
            </button>
            <button
              type="button"
              onClick={() => handleTypeSwitch("EXPENSE")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition",
                type === "EXPENSE"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              Expense (ব্যয়)
            </button>
            <button
              type="button"
              onClick={() => handleTypeSwitch("TRANSFER")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition",
                type === "TRANSFER"
                  ? "bg-[#0284C7] text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Transfer (হস্তান্তর)
            </button>
          </div>

          {/* Amount & Date */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Amount (৳ BDT) *
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base font-bold text-slate-400">
                  ৳
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  autoFocus
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-8 pr-3 text-lg font-bold text-[#0A192F] tabular-nums outline-none transition focus:border-[#0284C7] focus:ring-2 focus:ring-[#0284C7]/15"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Voucher Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-[#0284C7]"
              />
            </div>
          </div>

          {/* Wallet Selector with Live Verified Balances */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">
              {type === "TRANSFER"
                ? "From Wallet (Source)"
                : "Account / Wallet"}
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {wallets.map((w, idx) => (
                <button
                  key={w.id || `${w.type}-${idx}`}
                  type="button"
                  onClick={() => setSourceWalletIdx(idx)}
                  className={cn(
                    "flex flex-col items-start rounded-lg border px-2.5 py-2 text-left transition",
                    sourceWalletIdx === idx
                      ? "border-[#0284C7] bg-sky-50/80 ring-1 ring-[#0284C7]"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  )}
                >
                  <span
                    className={cn(
                      "truncate text-xs font-semibold",
                      sourceWalletIdx === idx
                        ? "text-[#0369A1]"
                        : "text-slate-700"
                    )}
                  >
                    {w.name}
                  </span>
                  {typeof w.balance === "number" && (
                    <span className="mt-0.5 text-[10px] font-medium text-slate-500 tabular-nums">
                      {formatBDT(w.balance)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Destination Wallet (Transfer Only) */}
          {type === "TRANSFER" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                To Wallet (Destination — does not affect P&amp;L)
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {wallets.map((w, idx) => {
                  const isSame = idx === sourceWalletIdx;
                  return (
                    <button
                      key={`dest-${w.id || `${w.type}-${idx}`}`}
                      type="button"
                      disabled={isSame}
                      onClick={() => setDestWalletIdx(idx)}
                      className={cn(
                        "flex flex-col items-start rounded-lg border px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-40",
                        destWalletIdx === idx && !isSame
                          ? "border-[#0284C7] bg-sky-50/80 ring-1 ring-[#0284C7]"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      )}
                    >
                      <span
                        className={cn(
                          "truncate text-xs font-semibold",
                          destWalletIdx === idx && !isSame
                            ? "text-[#0369A1]"
                            : "text-slate-700"
                        )}
                      >
                        {w.name}
                      </span>
                      {typeof w.balance === "number" && (
                        <span className="mt-0.5 text-[10px] font-medium text-slate-500 tabular-nums">
                          {formatBDT(w.balance)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Category + Party + Reference */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {type !== "TRANSFER" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-[#0284C7]"
                >
                  {categories.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label} ({cat.bn})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {type !== "TRANSFER" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Customer / Vendor <span className="text-slate-400">(optional)</span>
                </label>
                <select
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-[#0284C7]"
                >
                  <option value="">— Walk-in / None —</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.role})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={type === "TRANSFER" ? "sm:col-span-2" : ""}>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Reference / TrxID / Invoice No.
              </label>
              <div className="relative">
                <Hash className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="e.g., INV-1042 or bKash TrxID"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-[#0284C7]"
                />
              </div>
            </div>

            <div className={type === "TRANSFER" ? "sm:col-span-2" : ""}>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Note / Narration
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  type === "TRANSFER"
                    ? "e.g., Daily cash deposit to bank"
                    : "Brief description for audit trail"
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#0284C7]"
              />
            </div>
          </div>

          {/* Smart Receipt Policy Upload */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-600">
                Receipt / Cash Memo
              </label>
              {isReceiptRequired ? (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-rose-200">
                  Required (&gt; ৳ 2,000)
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">Optional</span>
              )}
            </div>

            {receipt ? (
              <div className="flex items-center justify-between rounded-lg border border-sky-200 bg-sky-50/60 p-2.5">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={receipt.url}
                    alt="Uploaded receipt"
                    className="h-10 w-10 rounded-md border border-slate-200 object-cover"
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-800">
                      Receipt attached
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Verified on Cloudinary
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReceipt(null)}
                  className="rounded-md p-1.5 text-rose-600 hover:bg-rose-50"
                  title="Remove receipt"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                className={cn(
                  "flex cursor-pointer items-center justify-center gap-2.5 rounded-lg border border-dashed px-4 py-3 text-center transition",
                  dragActive
                    ? "border-[#0284C7] bg-sky-50"
                    : isReceiptRequired
                    ? "border-rose-300 bg-rose-50/40 hover:border-rose-400"
                    : "border-slate-300 bg-slate-50/60 hover:border-[#0284C7]"
                )}
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                  }}
                />
                {uploading ? (
                  <div className="flex items-center gap-2 text-xs font-medium text-[#0284C7]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading receipt...
                  </div>
                ) : (
                  <>
                    <UploadCloud className="h-5 w-5 shrink-0 text-[#0284C7]" />
                    <div className="text-left">
                      <p className="text-xs font-medium text-slate-700">
                        Click or drag cash memo photo here
                      </p>
                      <p className="flex items-center gap-1 text-[10px] text-slate-500">
                        <ImagePlus className="h-3 w-3" /> JPG, PNG, WEBP up to
                        5MB
                      </p>
                    </div>
                  </>
                )}
              </label>
            )}
          </div>

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || uploading}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-xs transition disabled:opacity-60",
                type === "INCOME"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : type === "EXPENSE"
                  ? "bg-rose-600 hover:bg-rose-700"
                  : "bg-[#0284C7] hover:bg-[#0369A1]"
              )}
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {type === "TRANSFER"
                ? "Record Transfer"
                : `Save ${type === "INCOME" ? "Income" : "Expense"} Voucher`}
            </button>
          </div>
        </form>
      </Modal>

      {/* Auto-Voucher Confirmation Toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border border-emerald-200 bg-[#0A192F] px-4 py-3 text-white shadow-2xl">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          <div>
            <p className="font-mono text-xs font-semibold text-[#38BDF8]">
              {toast.voucherNo}
            </p>
            <p className="text-xs text-slate-200">{toast.message}</p>
          </div>
        </div>
      )}
    </>
  );
}
