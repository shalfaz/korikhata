"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Building2,
  GitBranch,
  History,
  Loader2,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { WALLET_TYPE_LABELS, WORKFLOW_LABELS } from "@/lib/constants";
import { cn, formatBDT, formatDateTime } from "@/lib/utils";
import { ApprovalWorkflow, WalletType } from "@/models/Company";

interface CompanyProfile {
  id: string;
  name: string;
  companyCode: string;
  businessType: string;
  phone: string;
  email: string;
  address: string;
  approvalWorkflow: ApprovalWorkflow;
  wallets: Array<{
    id: string;
    name: string;
    type: WalletType;
    accountNumber: string;
    openingBalance: number;
  }>;
}

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  summary: string;
  actorName: string;
  createdAt: string;
}

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const isSuperAdmin = session?.user?.role === "COMPANY_SUPER_ADMIN";

  const [activeTab, setActiveTab] = useState<"profile" | "wallets" | "audit">(
    "profile"
  );

  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [approvalWorkflow, setApprovalWorkflow] =
    useState<ApprovalWorkflow>("3_STEP");
  const [savingProfile, setSavingProfile] = useState(false);

  const [walletName, setWalletName] = useState("");
  const [walletType, setWalletType] = useState<WalletType>("BKASH");
  const [walletAcc, setWalletAcc] = useState("");
  const [walletOpening, setWalletOpening] = useState("0");
  const [savingWallet, setSavingWallet] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [compRes, auditRes] = await Promise.all([
        fetch("/api/companies", { cache: "no-store" }),
        fetch("/api/audit-logs?limit=60", { cache: "no-store" }),
      ]);

      if (compRes.ok) {
        const compJson = await compRes.json();
        const c = compJson.company as CompanyProfile;
        setCompany(c);
        setName(c.name);
        setBusinessType(c.businessType || "");
        setPhone(c.phone || "");
        setEmail(c.email || "");
        setAddress(c.address || "");
        setApprovalWorkflow(c.approvalWorkflow || "3_STEP");
      }

      if (auditRes.ok) {
        const auditJson = await auditRes.json();
        setLogs(auditJson.logs || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  function flash(msg: string, isError = false) {
    if (isError) {
      setError(msg);
      setNotice(null);
    } else {
      setNotice(msg);
      setError(null);
    }
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await fetch("/api/companies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE_PROFILE",
          name: name.trim(),
          businessType: businessType.trim(),
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
          approvalWorkflow,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update profile.");
      await update();
      flash("Organization profile & workflow updated.");
      loadAll();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Update failed.", true);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleAddWallet(e: FormEvent) {
    e.preventDefault();
    setSavingWallet(true);
    try {
      const res = await fetch("/api/companies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ADD_WALLET",
          wallet: {
            name: walletName.trim(),
            type: walletType,
            accountNumber: walletAcc.trim() || undefined,
            openingBalance: Number(walletOpening) || 0,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add wallet.");
      setWalletName("");
      setWalletAcc("");
      setWalletOpening("0");
      flash("Account wallet added.");
      loadAll();
    } catch (err) {
      flash(err instanceof Error ? err.message : "Could not add wallet.", true);
    } finally {
      setSavingWallet(false);
    }
  }

  async function handleRemoveWallet(walletId: string) {
    if (!window.confirm("Remove this wallet from active selection?")) return;
    const res = await fetch("/api/companies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "REMOVE_WALLET", walletId }),
    });
    const json = await res.json();
    if (!res.ok) {
      flash(json.error || "Could not remove wallet.", true);
      return;
    }
    flash("Wallet removed.");
    loadAll();
  }

  if (loading && !company) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-[#0284C7]" />
        Loading organization settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#0A192F] sm:text-2xl">
            Settings &amp; Audit Trail
          </h1>
          <p className="text-xs text-slate-500">
            Configure organization profile, approval depth, wallets, and audit
            logs
          </p>
        </div>
        <Link
          href="/team"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <GitBranch className="h-3.5 w-3.5 text-[#0284C7]" />
          Manage Branches &amp; Team
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {[
          { id: "profile", label: "Organization & Workflow", icon: Building2 },
          { id: "wallets", label: "Account Wallets", icon: Wallet },
          { id: "audit", label: "Activity Audit Log", icon: History },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() =>
                setActiveTab(t.id as "profile" | "wallets" | "audit")
              }
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition",
                activeTab === t.id
                  ? "bg-[#0A192F] text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-700">
          {error}
        </div>
      )}

      {activeTab === "profile" && (
        <form
          onSubmit={handleSaveProfile}
          className="max-w-2xl space-y-4 rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#0A192F]">
              Organization Profile
            </h2>
            {company?.companyCode && (
              <span className="rounded-md bg-sky-50 px-2 py-0.5 font-mono text-xs font-semibold text-[#0369A1]">
                Code: {company.companyCode}
              </span>
            )}
          </div>

          {!isSuperAdmin && (
            <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs font-medium text-[#0369A1]">
              Only the Company Super Admin (MD) can modify organization
              settings.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Company Name
              </label>
              <input
                type="text"
                required
                disabled={!isSuperAdmin}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7] disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Approval Workflow Depth
              </label>
              <select
                disabled={!isSuperAdmin}
                value={approvalWorkflow}
                onChange={(e) =>
                  setApprovalWorkflow(e.target.value as ApprovalWorkflow)
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0284C7] disabled:bg-slate-50"
              >
                {(Object.keys(WORKFLOW_LABELS) as ApprovalWorkflow[]).map(
                  (wf) => (
                    <option key={wf} value={wf}>
                      {WORKFLOW_LABELS[wf].label}
                    </option>
                  )
                )}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Industry
              </label>
              <input
                type="text"
                disabled={!isSuperAdmin}
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7] disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Phone
              </label>
              <input
                type="tel"
                disabled={!isSuperAdmin}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7] disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Business Email
              </label>
              <input
                type="email"
                disabled={!isSuperAdmin}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7] disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Address
              </label>
              <input
                type="text"
                disabled={!isSuperAdmin}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7] disabled:bg-slate-50"
              />
            </div>
          </div>

          {isSuperAdmin && (
            <button
              type="submit"
              disabled={savingProfile}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0284C7] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0369A1] disabled:opacity-60"
            >
              {savingProfile && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Changes
            </button>
          )}
        </form>
      )}

      {activeTab === "wallets" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs">
            <h2 className="mb-4 text-sm font-semibold text-[#0A192F]">
              Active Account Wallets
            </h2>
            <div className="space-y-2.5">
              {(company?.wallets || []).map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5"
                >
                  <div>
                    <p className="text-xs font-semibold text-[#0A192F]">
                      {w.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {WALLET_TYPE_LABELS[w.type]}
                      {w.accountNumber ? ` · ${w.accountNumber}` : ""} ·
                      Opening: {formatBDT(w.openingBalance)}
                    </p>
                  </div>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => handleRemoveWallet(w.id)}
                      className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {isSuperAdmin && (
            <form
              onSubmit={handleAddWallet}
              className="space-y-3.5 rounded-xl border border-slate-200/80 bg-white p-6 shadow-xs"
            >
              <h2 className="text-sm font-semibold text-[#0A192F]">
                Add New Wallet
              </h2>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Wallet Name *
                </label>
                <input
                  type="text"
                  required
                  value={walletName}
                  onChange={(e) => setWalletName(e.target.value)}
                  placeholder="e.g., City Bank Current"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Type
                  </label>
                  <select
                    value={walletType}
                    onChange={(e) =>
                      setWalletType(e.target.value as WalletType)
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
                  >
                    <option value="CASH">Cash</option>
                    <option value="BKASH">bKash</option>
                    <option value="NAGAD">Nagad</option>
                    <option value="ROCKET">Rocket</option>
                    <option value="BANK">Bank Account</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Opening Balance (৳)
                  </label>
                  <input
                    type="number"
                    value={walletOpening}
                    onChange={(e) => setWalletOpening(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Account Number (Optional)
                </label>
                <input
                  type="text"
                  value={walletAcc}
                  onChange={(e) => setWalletAcc(e.target.value)}
                  placeholder="017XXXXXXXX / Account #"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
                />
              </div>
              <button
                type="submit"
                disabled={savingWallet}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0284C7] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0369A1] disabled:opacity-60"
              >
                {savingWallet ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Add Wallet
              </button>
            </form>
          )}
        </div>
      )}

      {activeTab === "audit" && (
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-[#0A192F]">
              Activity Audit Trail
            </h2>
            <p className="text-xs text-slate-500">
              Immutable log of submissions, approvals, rejections, edits, and
              branch changes
            </p>
          </div>
          {logs.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No audit events recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-[#0A192F]">
                        {log.actorName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            log.action === "APPROVE" || log.action === "CREATE"
                              ? "bg-emerald-50 text-emerald-700"
                              : log.action === "REJECT" ||
                                log.action === "SOFT_DELETE"
                              ? "bg-rose-50 text-rose-700"
                              : "bg-sky-50 text-[#0369A1]"
                          )}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{log.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
