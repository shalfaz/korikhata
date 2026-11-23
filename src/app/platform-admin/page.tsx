"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import {
  Building2,
  CheckCircle2,
  GitBranch,
  Loader2,
  LogOut,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import { WORKFLOW_LABELS } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";
import {
  ApprovalWorkflow,
  SubscriptionPlan,
  SubscriptionStatus,
} from "@/models/Company";
import { PlatformRole } from "@/models/User";

interface PlatformCompanyRow {
  id: string;
  name: string;
  companyCode: string;
  businessType: string;
  approvalWorkflow: ApprovalWorkflow;
  subscription: {
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
  };
  isActive: boolean;
  branchCount: number;
  userCount: number;
  superAdmin: {
    name: string;
    email: string;
    employeeCode: string;
  } | null;
  createdAt: string;
}

interface PlatformAdminRow {
  id: string;
  name: string;
  email: string;
  platformRole: PlatformRole;
  isActive: boolean;
  createdAt: string;
}

export default function PlatformAdminPortalPage() {
  const { data: session } = useSession();
  const isRootOwner =
    session?.user?.isPlatformAdmin &&
    (session.user.platformRole === "ROOT_OWNER" || !session.user.platformRole);

  const [activeTab, setActiveTab] = useState<"organizations" | "admins">(
    "organizations"
  );

  const [companies, setCompanies] = useState<PlatformCompanyRow[]>([]);
  const [admins, setAdmins] = useState<PlatformAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Provision Company Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [companyCode, setCompanyCode] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [hqBranchName, setHqBranchName] = useState("Head Office - Dhaka");
  const [approvalWorkflow, setApprovalWorkflow] =
    useState<ApprovalWorkflow>("3_STEP");
  const [plan, setPlan] = useState<SubscriptionPlan>("ENTERPRISE");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminEmployeeCode, setAdminEmployeeCode] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Add Platform Sub-Admin Modal (ROOT_OWNER only)
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const [subName, setSubName] = useState("");
  const [subEmail, setSubEmail] = useState("");
  const [subPassword, setSubPassword] = useState("");
  const [submittingAdmin, setSubmittingAdmin] = useState(false);
  const [adminFormError, setAdminFormError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/platform/companies", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load organizations.");
      setCompanies(json.companies || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load organizations."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAdmins = useCallback(async () => {
    if (!isRootOwner) return;
    setLoadingAdmins(true);
    try {
      const res = await fetch("/api/platform/admins", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        setAdmins(json.admins || []);
      }
    } finally {
      setLoadingAdmins(false);
    }
  }, [isRootOwner]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    if (isRootOwner) {
      loadAdmins();
    }
  }, [isRootOwner, loadAdmins]);

  async function handleProvision(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/platform/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          companyCode: companyCode.trim().toUpperCase(),
          businessType: businessType.trim() || undefined,
          hqBranchName: hqBranchName.trim() || "Head Office - Dhaka",
          approvalWorkflow,
          plan,
          subscriptionStatus: "ACTIVE",
          adminName: adminName.trim(),
          adminEmail: adminEmail.trim().toLowerCase(),
          adminEmployeeCode: adminEmployeeCode.trim() || undefined,
          adminPassword,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to provision company.");
      }

      setNotice(
        `Provisioned ${json.company.name} (Code: ${json.company.companyCode}) — MD Login: ${json.superAdmin.email} / ${json.superAdmin.employeeCode}`
      );
      setCreateOpen(false);
      setName("");
      setCompanyCode("");
      setBusinessType("");
      setAdminName("");
      setAdminEmail("");
      setAdminEmployeeCode("");
      setAdminPassword("");
      loadCompanies();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to create company."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateCompany(
    companyId: string,
    payload: {
      subscriptionStatus?: SubscriptionStatus;
      approvalWorkflow?: ApprovalWorkflow;
    }
  ) {
    const res = await fetch("/api/platform/companies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, ...payload }),
    });
    if (res.ok) {
      loadCompanies();
    }
  }

  async function handleCreateSubAdmin(e: FormEvent) {
    e.preventDefault();
    setAdminFormError(null);
    setSubmittingAdmin(true);

    try {
      const res = await fetch("/api/platform/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: subName.trim(),
          email: subEmail.trim().toLowerCase(),
          password: subPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to add Platform Admin.");
      }

      setNotice(json.message || "Platform Admin added.");
      setAddAdminOpen(false);
      setSubName("");
      setSubEmail("");
      setSubPassword("");
      loadAdmins();
    } catch (err) {
      setAdminFormError(
        err instanceof Error ? err.message : "Could not add Platform Admin."
      );
    } finally {
      setSubmittingAdmin(false);
    }
  }

  async function handleRevokeSubAdmin(admin: PlatformAdminRow) {
    const confirmed = window.confirm(
      `Revoke Platform Admin access for ${admin.name} (${admin.email})? They will no longer be able to access the Platform Portal.`
    );
    if (!confirmed) return;

    setRevokingId(admin.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/platform/admins", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminId: admin.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to revoke Platform Admin.");
      }
      setNotice(json.message || "Platform Admin access revoked.");
      loadAdmins();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not revoke Platform Admin."
      );
    } finally {
      setRevokingId(null);
    }
  }

  const activeCount = companies.filter(
    (c) => c.subscription.status === "ACTIVE"
  ).length;
  const totalBranches = companies.reduce((a, c) => a + c.branchCount, 0);
  const totalUsers = companies.reduce((a, c) => a + c.userCount, 0);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Bar */}
      <header className="border-b border-white/10 bg-[#0A192F] text-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0284C7] text-base font-bold text-white">
              ৳
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">
                KoriKhata Platform Portal
              </p>
              <p className="text-[11px] text-sky-300/90">
                {isRootOwner ? "Root Owner Governance" : "Platform Admin Portal"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="flex items-center justify-end gap-1.5">
                <p className="text-xs font-medium text-white">
                  {session?.user?.name || "Platform Admin"}
                </p>
                <span className="rounded bg-[#0284C7]/30 px-1.5 py-0.5 text-[10px] font-medium text-[#38BDF8]">
                  {isRootOwner ? "Root Owner" : "Platform Admin"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {session?.user?.email}
              </p>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
        {/* Header & Primary Action */}
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#0A192F] sm:text-2xl">
              {activeTab === "organizations"
                ? "Client Organizations"
                : "Platform Admins"}
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {activeTab === "organizations"
                ? "Provision companies, assign unique Company Codes, and configure Maker-Checker approval depth"
                : "Appoint trusted Platform Admins to onboard and manage client organizations"}
            </p>
          </div>

          {activeTab === "organizations" ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#0284C7] px-4 text-xs font-semibold text-white shadow-xs transition hover:bg-[#0369A1]"
            >
              <Plus className="h-4 w-4" />
              Provision Organization
            </button>
          ) : (
            isRootOwner && (
              <button
                type="button"
                onClick={() => setAddAdminOpen(true)}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#0284C7] px-4 text-xs font-semibold text-white shadow-xs transition hover:bg-[#0369A1]"
              >
                <UserPlus className="h-4 w-4" />
                Add Platform Admin
              </button>
            )
          )}
        </div>

        {/* Root Owner Navigation Tabs */}
        {isRootOwner && (
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <button
              type="button"
              onClick={() => setActiveTab("organizations")}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition",
                activeTab === "organizations"
                  ? "bg-[#0A192F] text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100"
              )}
            >
              <Building2 className="h-3.5 w-3.5" />
              Client Organizations ({companies.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("admins")}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition",
                activeTab === "admins"
                  ? "bg-[#0A192F] text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100"
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Platform Admins ({admins.length})
            </button>
          </div>
        )}

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

        {/* TAB 1: Client Organizations */}
        {activeTab === "organizations" && (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Total Organizations</span>
                  <Building2 className="h-4 w-4 text-[#0284C7]" />
                </div>
                <p className="mt-2 text-2xl font-semibold text-[#0A192F] tabular-nums">
                  {companies.length}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Active Subscriptions</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="mt-2 text-2xl font-semibold text-[#0A192F] tabular-nums">
                  {activeCount}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Total Branches</span>
                  <GitBranch className="h-4 w-4 text-[#0284C7]" />
                </div>
                <p className="mt-2 text-2xl font-semibold text-[#0A192F] tabular-nums">
                  {totalBranches}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Provisioned Users</span>
                  <Users className="h-4 w-4 text-[#0284C7]" />
                </div>
                <p className="mt-2 text-2xl font-semibold text-[#0A192F] tabular-nums">
                  {totalUsers}
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin text-[#0284C7]" />
                  Loading client organizations...
                </div>
              ) : companies.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Shield className="mb-2 h-8 w-8 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-700">
                    No client organizations provisioned yet
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Click &quot;Provision Organization&quot; to onboard
                    Shilpalay, Looklify, or your first enterprise client.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Organization</th>
                        <th className="px-4 py-3">Company Code</th>
                        <th className="px-4 py-3">MD / Super Admin</th>
                        <th className="px-4 py-3">Scale</th>
                        <th className="px-4 py-3">Approval Workflow</th>
                        <th className="px-4 py-3">Subscription</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {companies.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3.5">
                            <p className="text-sm font-semibold text-[#0A192F]">
                              {c.name}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {c.businessType || "Enterprise"} · Created{" "}
                              {formatDate(c.createdAt)}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5">
                            <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 font-mono text-xs font-semibold text-[#0369A1]">
                              {c.companyCode}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            {c.superAdmin ? (
                              <>
                                <p className="font-medium text-slate-800">
                                  {c.superAdmin.name}
                                </p>
                                <p className="text-[11px] text-slate-400">
                                  {c.superAdmin.email}
                                </p>
                              </>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 text-slate-600 tabular-nums">
                            {c.branchCount} branches · {c.userCount} users
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5">
                            <select
                              value={c.approvalWorkflow}
                              onChange={(e) =>
                                handleUpdateCompany(c.id, {
                                  approvalWorkflow: e.target
                                    .value as ApprovalWorkflow,
                                })
                              }
                              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:border-[#0284C7]"
                            >
                              {(
                                Object.keys(
                                  WORKFLOW_LABELS
                                ) as ApprovalWorkflow[]
                              ).map((wf) => (
                                <option key={wf} value={wf}>
                                  {WORKFLOW_LABELS[wf].label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5">
                            <select
                              value={c.subscription.status}
                              onChange={(e) =>
                                handleUpdateCompany(c.id, {
                                  subscriptionStatus: e.target
                                    .value as SubscriptionStatus,
                                })
                              }
                              className={cn(
                                "rounded-lg border px-2 py-1 text-xs font-semibold outline-none",
                                c.subscription.status === "ACTIVE"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : c.subscription.status === "TRIAL"
                                  ? "border-sky-200 bg-sky-50 text-[#0369A1]"
                                  : "border-rose-200 bg-rose-50 text-rose-700"
                              )}
                            >
                              <option value="ACTIVE">ACTIVE</option>
                              <option value="TRIAL">TRIAL</option>
                              <option value="SUSPENDED">SUSPENDED</option>
                              <option value="CANCELLED">CANCELLED</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* TAB 2: Platform Admins (ROOT_OWNER only) */}
        {activeTab === "admins" && isRootOwner && (
          <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs">
            {loadingAdmins ? (
              <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-[#0284C7]" />
                Loading platform admins...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Administrator</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Added</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {admins.map((admin) => {
                      const isRowRoot = admin.platformRole === "ROOT_OWNER";
                      return (
                        <tr key={admin.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-3.5 font-semibold text-[#0A192F]">
                            {admin.name}
                          </td>
                          <td className="px-4 py-3.5 text-slate-600">
                            {admin.email}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                                isRowRoot
                                  ? "bg-[#0A192F] text-[#38BDF8]"
                                  : "bg-sky-50 text-[#0369A1]"
                              )}
                            >
                              <ShieldCheck className="h-3 w-3" />
                              {isRowRoot ? "Root Owner" : "Platform Admin"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 text-slate-500">
                            {formatDate(admin.createdAt)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 text-right">
                            {isRowRoot ? (
                              <span className="text-[11px] text-slate-400">
                                Protected
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={revokingId === admin.id}
                                onClick={() => handleRevokeSubAdmin(admin)}
                                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                              >
                                {revokingId === admin.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                                Revoke
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Provision Client Company Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Provision Client Organization"
        subtitle="Creates the organization, Head Office branch, and initial MD / Company Super Admin login"
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleProvision} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Organization Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Shilpalay Limited"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Unique Company Code *
              </label>
              <input
                type="text"
                required
                value={companyCode}
                onChange={(e) => setCompanyCode(e.target.value.toUpperCase())}
                placeholder="e.g., SHILPALAY"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-[#0284C7]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Approval Workflow Depth
              </label>
              <select
                value={approvalWorkflow}
                onChange={(e) =>
                  setApprovalWorkflow(e.target.value as ApprovalWorkflow)
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
              >
                {(Object.keys(WORKFLOW_LABELS) as ApprovalWorkflow[]).map(
                  (wf) => (
                    <option key={wf} value={wf}>
                      {WORKFLOW_LABELS[wf].label}
                    </option>
                  )
                )}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">
                {WORKFLOW_LABELS[approvalWorkflow].description}
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Initial Head Office Branch
              </label>
              <input
                type="text"
                required
                value={hqBranchName}
                onChange={(e) => setHqBranchName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Industry
              </label>
              <input
                type="text"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                placeholder="Retail / E-commerce"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Plan
              </label>
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as SubscriptionPlan)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
              >
                <option value="STARTER">Starter</option>
                <option value="PRO">Pro</option>
                <option value="ENTERPRISE">Enterprise</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <p className="text-xs font-semibold text-[#0A192F]">
              Initial Company Super Admin (MD / Governor)
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Managing Director Name"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Employee ID (Optional)
                </label>
                <input
                  type="text"
                  value={adminEmployeeCode}
                  onChange={(e) =>
                    setAdminEmployeeCode(e.target.value.toUpperCase())
                  }
                  placeholder="e.g., SHL-MD-01"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm uppercase outline-none focus:border-[#0284C7]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Email *
                </label>
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="md@shilpalay.com"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Initial Password *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
                />
              </div>
            </div>
          </div>

          {formError && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0284C7] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0369A1] disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Provision Organization
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Platform Sub-Admin Modal (ROOT_OWNER only) */}
      <Modal
        open={addAdminOpen}
        onClose={() => setAddAdminOpen(false)}
        title="Add Platform Admin"
        subtitle="Can onboard client organizations and manage subscriptions, but cannot manage other Platform Admins"
      >
        <form onSubmit={handleCreateSubAdmin} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={subName}
              onChange={(e) => setSubName(e.target.value)}
              placeholder="e.g., Operations Admin"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Email Address *
            </label>
            <input
              type="email"
              required
              value={subEmail}
              onChange={(e) => setSubEmail(e.target.value)}
              placeholder="ops@korikhata.com"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Password *
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={subPassword}
              onChange={(e) => setSubPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
            />
          </div>

          {adminFormError && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {adminFormError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setAddAdminOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingAdmin}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0284C7] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0369A1] disabled:opacity-60"
            >
              {submittingAdmin && (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              )}
              Create Platform Admin
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
