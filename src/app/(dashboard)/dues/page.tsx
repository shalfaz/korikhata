"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  CheckCircle2,
  Clock,
  Loader2,
  MessageCircle,
  Phone,
  Plus,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import {
  cn,
  formatBDT,
  formatDate,
  generateWhatsAppReminderUrl,
  toDateInputValue,
} from "@/lib/utils";

interface DueHistoryItem {
  id: string;
  entryType: "DUE_ADDED" | "PAYMENT_RECEIVED" | "PAYMENT_MADE";
  direction: "RECEIVABLE" | "PAYABLE";
  amount: number;
  date: string;
  note: string;
}

interface DueContact {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  role: "CUSTOMER" | "SUPPLIER" | "BOTH";
  receivableBalance: number;
  payableBalance: number;
  nextDueDate: string | null;
  notes: string;
  dueHistory: DueHistoryItem[];
}

export default function DuesPage() {
  const { data: session } = useSession();
  const isViewer = session?.user?.role === "EMPLOYEE";

  const [tab, setTab] = useState<"receivable" | "payable" | "all">("receivable");
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<DueContact[]>([]);
  const [summary, setSummary] = useState({
    totalReceivable: 0,
    totalPayable: 0,
    receivableCount: 0,
    payableCount: 0,
  });
  const [companyName, setCompanyName] = useState("KoriKhata Business");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Add Contact Modal
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState<"CUSTOMER" | "SUPPLIER" | "BOTH">("CUSTOMER");
  const [newDueAmount, setNewDueAmount] = useState("");
  const [newDueDir, setNewDueDir] = useState<"RECEIVABLE" | "PAYABLE">("RECEIVABLE");
  const [newNote, setNewNote] = useState("");
  const [savingContact, setSavingContact] = useState(false);

  // Record Payment / Add Due Modal
  const [actionContact, setActionContact] = useState<DueContact | null>(null);
  const [actionType, setActionType] = useState<
    "PAYMENT_RECEIVED" | "PAYMENT_MADE" | "DUE_ADDED"
  >("PAYMENT_RECEIVED");
  const [actionDir, setActionDir] = useState<"RECEIVABLE" | "PAYABLE">("RECEIVABLE");
  const [actionAmount, setActionAmount] = useState("");
  const [actionWallet, setActionWallet] = useState("CASH");
  const [actionDate, setActionDate] = useState(toDateInputValue());
  const [actionNote, setActionNote] = useState("");
  const [savingAction, setSavingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadDues = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/contacts?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok) {
        setContacts(json.contacts || []);
        setSummary(json.summary || {});
        if (json.companyName) setCompanyName(json.companyName);
      }
    } finally {
      setLoading(false);
    }
  }, [tab, search]);

  useEffect(() => {
    const t = setTimeout(loadDues, 180);
    return () => clearTimeout(t);
  }, [loadDues]);

  useEffect(() => {
    const handler = () => loadDues();
    window.addEventListener("korikhata:data-updated", handler);
    return () => window.removeEventListener("korikhata:data-updated", handler);
  }, [loadDues]);

  async function handleAddContact(e: FormEvent) {
    e.preventDefault();
    setSavingContact(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          phone: newPhone.trim() || undefined,
          role: newRole,
          openingDueAmount: Number(newDueAmount) || 0,
          openingDueDirection: newDueDir,
          notes: newNote.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add contact.");

      setAddOpen(false);
      setNewName("");
      setNewPhone("");
      setNewDueAmount("");
      setNewNote("");
      loadDues();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not add contact.");
    } finally {
      setSavingContact(false);
    }
  }

  function openPaymentModal(
    contact: DueContact,
    entryType: "PAYMENT_RECEIVED" | "PAYMENT_MADE" | "DUE_ADDED",
    direction: "RECEIVABLE" | "PAYABLE"
  ) {
    setActionContact(contact);
    setActionType(entryType);
    setActionDir(direction);
    setActionAmount(
      entryType === "PAYMENT_RECEIVED"
        ? String(contact.receivableBalance)
        : entryType === "PAYMENT_MADE"
        ? String(contact.payableBalance)
        : ""
    );
    setActionDate(toDateInputValue());
    setActionNote("");
    setActionError(null);
  }

  async function handleSubmitDueAction(e: FormEvent) {
    e.preventDefault();
    if (!actionContact) return;
    setActionError(null);
    setSavingAction(true);

    const walletNameMap: Record<string, string> = {
      CASH: "Cash in Hand",
      BKASH: "bKash",
      NAGAD: "Nagad",
      BANK: "Bank Account",
    };

    try {
      const res = await fetch(`/api/contacts/${actionContact.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryType: actionType,
          direction: actionDir,
          amount: Number(actionAmount),
          walletType: actionWallet,
          walletName: walletNameMap[actionWallet] || "Cash in Hand",
          date: actionDate,
          note: actionNote.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update due.");

      setActionContact(null);
      window.dispatchEvent(new CustomEvent("korikhata:data-updated"));
      loadDues();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not record update."
      );
    } finally {
      setSavingAction(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0A192F]">
            Smart Due Tracker (বাকি খাতা)
          </h1>
          <p className="text-sm text-slate-500">
            Track Receivables (পাওনা) &amp; Payables (দেনা) with partial payment
            history &amp; 1-click WhatsApp reminders
          </p>
        </div>

        {!isViewer && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0284C7] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0369A1]"
          >
            <UserPlus className="h-4 w-4" />
            Add Customer / Supplier
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-sky-200 bg-linear-to-br from-sky-50 to-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#0369A1]">
            Total Receivable (মোট পাওনা — আমরা পাবো)
          </p>
          <p className="mt-2 text-3xl font-extrabold text-[#0A192F]">
            {formatBDT(summary.totalReceivable)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Across {summary.receivableCount} customers with open dues
          </p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-linear-to-br from-amber-50 to-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            Total Payable (মোট দেনা — আমরা দেবো)
          </p>
          <p className="mt-2 text-3xl font-extrabold text-amber-900">
            {formatBDT(summary.totalPayable)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Across {summary.payableCount} suppliers / vendors
          </p>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="inline-flex rounded-xl bg-slate-200/70 p-1">
          {[
            { id: "receivable", label: "Receivables (পাওনা)" },
            { id: "payable", label: "Payables (দেনা)" },
            { id: "all", label: "All Contacts" },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                setTab(item.id as "receivable" | "payable" | "all")
              }
              className={cn(
                "rounded-lg px-3.5 py-2 text-xs font-semibold transition",
                tab === item.id
                  ? "bg-white text-[#0A192F] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or phone..."
            className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#0284C7]"
          />
        </div>
      </div>

      {/* Contacts List */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-[#0284C7]" />
          Loading বাকি খাতা...
        </div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <Users className="mb-2 h-10 w-10 text-slate-300" />
          <p className="text-base font-semibold text-slate-700">
            No dues found in this view
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Add a customer or supplier to start tracking partial payments &amp;
            WhatsApp reminders.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {contacts.map((contact) => {
            const isExpanded = expandedId === contact.id;
            const hasReceivable = contact.receivableBalance > 0;
            const hasPayable = contact.payableBalance > 0;

            return (
              <div
                key={contact.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-slate-300"
              >
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-[#0A192F]">
                        {contact.name}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                        {contact.role}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      {contact.phone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3.5 w-3.5" />
                          {contact.phone}
                        </span>
                      )}
                      {contact.nextDueDate && (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <Clock className="h-3.5 w-3.5" />
                          Due: {formatDate(contact.nextDueDate)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Balances & Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2.5">
                    {hasReceivable && (
                      <div className="rounded-xl bg-sky-50 px-3 py-1.5 text-right">
                        <p className="text-[10px] font-semibold uppercase text-[#0369A1]">
                          Receivable (পাওনা)
                        </p>
                        <p className="text-base font-extrabold text-[#0A192F]">
                          {formatBDT(contact.receivableBalance)}
                        </p>
                      </div>
                    )}

                    {hasPayable && (
                      <div className="rounded-xl bg-amber-50 px-3 py-1.5 text-right">
                        <p className="text-[10px] font-semibold uppercase text-amber-800">
                          Payable (দেনা)
                        </p>
                        <p className="text-base font-extrabold text-amber-900">
                          {formatBDT(contact.payableBalance)}
                        </p>
                      </div>
                    )}

                    {!hasReceivable && !hasPayable && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Settled
                      </span>
                    )}

                    {/* 1-Click WhatsApp Reminder */}
                    {hasReceivable && (
                      <a
                        href={generateWhatsAppReminderUrl(
                          contact.phone,
                          contact.name,
                          contact.receivableBalance,
                          companyName
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                        WhatsApp Reminder
                      </a>
                    )}

                    {!isViewer && hasReceivable && (
                      <button
                        type="button"
                        onClick={() =>
                          openPaymentModal(
                            contact,
                            "PAYMENT_RECEIVED",
                            "RECEIVABLE"
                          )
                        }
                        className="rounded-xl bg-[#0284C7] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#0369A1]"
                      >
                        Receive Payment
                      </button>
                    )}

                    {!isViewer && hasPayable && (
                      <button
                        type="button"
                        onClick={() =>
                          openPaymentModal(contact, "PAYMENT_MADE", "PAYABLE")
                        }
                        className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-700"
                      >
                        Pay Supplier
                      </button>
                    )}

                    {!isViewer && (
                      <button
                        type="button"
                        onClick={() =>
                          openPaymentModal(
                            contact,
                            "DUE_ADDED",
                            tab === "payable" ? "PAYABLE" : "RECEIVABLE"
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add Due
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : contact.id)
                      }
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      {isExpanded
                        ? "Hide History"
                        : `History (${contact.dueHistory.length})`}
                    </button>
                  </div>
                </div>

                {/* Payment History Timeline */}
                {isExpanded && (
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Payment &amp; Due History
                    </p>
                    {contact.dueHistory.length === 0 ? (
                      <p className="text-xs text-slate-500">
                        No history recorded yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {contact.dueHistory.map((h) => (
                          <div
                            key={h.id}
                            className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs"
                          >
                            <div>
                              <span className="font-semibold text-slate-800">
                                {h.entryType === "PAYMENT_RECEIVED"
                                  ? "Payment Received (আদায়)"
                                  : h.entryType === "PAYMENT_MADE"
                                  ? "Payment Made (পরিশোধ)"
                                  : `Due Added (${
                                      h.direction === "RECEIVABLE"
                                        ? "পাওনা"
                                        : "দেনা"
                                    })`}
                              </span>
                              {h.note && (
                                <span className="ml-2 text-slate-500">
                                  — {h.note}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-400">
                                {formatDate(h.date)}
                              </span>
                              <span
                                className={cn(
                                  "font-bold",
                                  h.entryType === "DUE_ADDED"
                                    ? "text-amber-700"
                                    : "text-emerald-700"
                                )}
                              >
                                {formatBDT(h.amount)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Contact Modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Customer or Supplier"
        subtitle="Track receivables (পাওনা) and payables (দেনা) cleanly"
      >
        <form onSubmit={handleAddContact} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., Rahim Traders"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#0284C7]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                WhatsApp / Phone
              </label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="017XXXXXXXX"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#0284C7]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Contact Type
              </label>
              <select
                value={newRole}
                onChange={(e) =>
                  setNewRole(e.target.value as "CUSTOMER" | "SUPPLIER" | "BOTH")
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0284C7]"
              >
                <option value="CUSTOMER">Customer (ক্রেতা)</option>
                <option value="SUPPLIER">Supplier (সাপ্লায়ার)</option>
                <option value="BOTH">Both</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Opening Due Type
              </label>
              <select
                value={newDueDir}
                onChange={(e) =>
                  setNewDueDir(e.target.value as "RECEIVABLE" | "PAYABLE")
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0284C7]"
              >
                <option value="RECEIVABLE">Receivable (আমরা পাবো)</option>
                <option value="PAYABLE">Payable (আমরা দেবো)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Opening Due Amount (৳)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={newDueAmount}
              onChange={(e) => setNewDueAmount(e.target.value)}
              placeholder="0"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base font-bold outline-none focus:border-[#0284C7]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
              Note (Optional)
            </label>
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Invoice # or product details"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-[#0284C7]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingContact}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0284C7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0369A1] disabled:opacity-60"
            >
              {savingContact && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Contact
            </button>
          </div>
        </form>
      </Modal>

      {/* Record Payment / Add Due Modal */}
      <Modal
        open={Boolean(actionContact)}
        onClose={() => setActionContact(null)}
        title={
          actionType === "PAYMENT_RECEIVED"
            ? `Receive Payment from ${actionContact?.name}`
            : actionType === "PAYMENT_MADE"
            ? `Record Payment to ${actionContact?.name}`
            : `Add New Due for ${actionContact?.name}`
        }
        subtitle={
          actionType === "DUE_ADDED"
            ? "Increases the contact's outstanding balance"
            : "Automatically creates a linked entry in your Daily Ledger"
        }
      >
        {actionContact && (
          <form onSubmit={handleSubmitDueAction} className="space-y-4">
            {actionType === "DUE_ADDED" && (
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Due Type
                </label>
                <select
                  value={actionDir}
                  onChange={(e) =>
                    setActionDir(e.target.value as "RECEIVABLE" | "PAYABLE")
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0284C7]"
                >
                  <option value="RECEIVABLE">Receivable (আমরা পাবো)</option>
                  <option value="PAYABLE">Payable (আমরা দেবো)</option>
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Amount (৳ BDT) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={actionAmount}
                onChange={(e) => setActionAmount(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-lg font-bold outline-none focus:border-[#0284C7]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {actionType !== "DUE_ADDED" && (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                    Wallet
                  </label>
                  <select
                    value={actionWallet}
                    onChange={(e) => setActionWallet(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#0284C7]"
                  >
                    <option value="CASH">Cash in Hand</option>
                    <option value="BKASH">bKash</option>
                    <option value="NAGAD">Nagad</option>
                    <option value="BANK">Bank Account</option>
                  </select>
                </div>
              )}
              <div className={actionType === "DUE_ADDED" ? "col-span-2" : ""}>
                <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={actionDate}
                  onChange={(e) => setActionDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#0284C7]"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Note (Optional)
              </label>
              <input
                type="text"
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                placeholder="e.g., Partial payment via bKash"
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-[#0284C7]"
              />
            </div>

            {actionError && (
              <div className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                {actionError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActionContact(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingAction}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0284C7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0369A1] disabled:opacity-60"
              >
                {savingAction && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
