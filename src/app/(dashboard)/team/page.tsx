"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  Building2,
  GitBranch,
  Loader2,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import { ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { CompanyRole } from "@/models/User";

interface BranchRow {
  id: string;
  name: string;
  code: string;
  address: string;
  staffCount: number;
  manager: { name: string; employeeCode: string } | null;
}

interface MemberRow {
  id: string;
  name: string;
  email: string;
  employeeCode: string;
  phone: string;
  role: CompanyRole;
  branch: { id: string; name: string; code: string } | null;
  isActive: boolean;
}

export default function BranchesAndTeamPage() {
  const { data: session } = useSession();
  const role = session?.user?.role || "EMPLOYEE";
  const isSuperAdmin = role === "COMPANY_SUPER_ADMIN";
  const isBranchManager = role === "BRANCH_MANAGER";
  const canProvisionStaff = isSuperAdmin || isBranchManager;

  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Branch Modal
  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [branchAddress, setBranchAddress] = useState("");
  const [savingBranch, setSavingBranch] = useState(false);

  // Member Modal
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberCode, setMemberCode] = useState("");
  const [memberPhone, setMemberPhone] = useState("");
  const [memberRole, setMemberRole] = useState<CompanyRole>(
    isBranchManager ? "EMPLOYEE" : "BRANCH_MANAGER"
  );
  const [memberBranchId, setMemberBranchId] = useState("");
  const [memberPassword, setMemberPassword] = useState("");
  const [savingMember, setSavingMember] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, tRes] = await Promise.all([
        fetch("/api/branches", { cache: "no-store" }),
        fetch("/api/team", { cache: "no-store" }),
      ]);
      if (bRes.ok) {
        const bJson = await bRes.json();
        setBranches(bJson.branches || []);
        if (bJson.branches?.length && !memberBranchId) {
          setMemberBranchId(bJson.branches[0].id);
        }
      }
      if (tRes.ok) {
        const tJson = await tRes.json();
        setMembers(tJson.members || []);
      }
    } finally {
      setLoading(false);
    }
  }, [memberBranchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleCreateBranch(e: FormEvent) {
    e.preventDefault();
    setSavingBranch(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: branchName.trim(),
          code: branchCode.trim().toUpperCase(),
          address: branchAddress.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create branch.");
      setBranchModalOpen(false);
      setBranchName("");
      setBranchCode("");
      setBranchAddress("");
      setNotice(`Branch "${json.branch.name}" (${json.branch.code}) created.`);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create branch.");
    } finally {
      setSavingBranch(false);
    }
  }

  async function handleCreateMember(e: FormEvent) {
    e.preventDefault();
    setSavingMember(true);
    setError(null);
    setNotice(null);
    try {
      const effectiveRole: CompanyRole = isBranchManager
        ? "EMPLOYEE"
        : memberRole;
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: memberName.trim(),
          email: memberEmail.trim().toLowerCase(),
          employeeCode: memberCode.trim().toUpperCase(),
          phone: memberPhone.trim() || undefined,
          role: effectiveRole,
          branchId:
            effectiveRole === "HQ_ADMIN_OFFICER" ||
            effectiveRole === "COMPANY_SUPER_ADMIN"
              ? undefined
              : memberBranchId || undefined,
          password: memberPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to provision user.");
      setMemberModalOpen(false);
      setMemberName("");
      setMemberEmail("");
      setMemberCode("");
      setMemberPhone("");
      setMemberPassword("");
      setNotice(json.message || "User account provisioned.");
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add user.");
    } finally {
      setSavingMember(false);
    }
  }

  async function handleToggleActive(m: MemberRow) {
    const res = await fetch("/api/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: m.id, isActive: !m.isActive }),
    });
    if (res.ok) {
      loadData();
    }
  }

  if (loading && branches.length === 0 && members.length === 0) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-[#0284C7]" />
        Loading branches &amp; team...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#0A192F] sm:text-2xl">
            Branches &amp; Team Directory
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {isSuperAdmin
              ? "Manage district branches and provision HQ Officers, Branch Managers, and Staff"
              : isBranchManager
              ? "Provision and manage field/desk employees assigned to your branch"
              : "Organization branches and staff directory"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setBranchModalOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Plus className="h-3.5 w-3.5" />
              New Branch
            </button>
          )}
          {canProvisionStaff && (
            <button
              type="button"
              onClick={() => {
                setMemberRole(isBranchManager ? "EMPLOYEE" : "BRANCH_MANAGER");
                setMemberModalOpen(true);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0284C7] px-3.5 text-xs font-semibold text-white hover:bg-[#0369A1]"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {isBranchManager ? "Add Branch Employee" : "Provision User"}
            </button>
          )}
        </div>
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

      {/* Branches Grid */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <GitBranch className="h-3.5 w-3.5 text-[#0284C7]" />
          Branches &amp; Districts ({branches.length})
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {branches.map((b) => (
            <div
              key={b.id}
              className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-[#0284C7]">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#0A192F]">
                      {b.name}
                    </p>
                    <p className="font-mono text-[11px] text-slate-400">
                      {b.code}
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 tabular-nums">
                  {b.staffCount} staff
                </span>
              </div>
              {b.manager && (
                <p className="mt-3 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                  Manager:{" "}
                  <span className="font-medium text-slate-700">
                    {b.manager.name}
                  </span>
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Team Members Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#0284C7]" />
            <h2 className="text-sm font-semibold text-[#0A192F]">
              Provisioned Accounts ({members.length})
            </h2>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Employee ID</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Branch / District</th>
                <th className="px-4 py-3">Status</th>
                {canProvisionStaff && <th className="px-4 py-3 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <p className="text-xs font-semibold text-[#0A192F]">
                      {m.name}
                    </p>
                    <p className="text-[11px] text-slate-400">{m.email}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-medium text-slate-700">
                    {m.employeeCode || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-medium text-[#0369A1]">
                      {ROLE_LABELS[m.role]?.shortLabel || m.role}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {m.branch ? m.branch.name : "Head Office / All"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-medium",
                        m.isActive
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      )}
                    >
                      {m.isActive ? "Active" : "Disabled"}
                    </span>
                  </td>
                  {canProvisionStaff && (
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {m.id !== session?.user?.id &&
                        m.role !== "COMPANY_SUPER_ADMIN" && (
                          <button
                            type="button"
                            onClick={() => handleToggleActive(m)}
                            className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                          >
                            {m.isActive ? "Disable" : "Enable"}
                          </button>
                        )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Branch Modal */}
      <Modal
        open={branchModalOpen}
        onClose={() => setBranchModalOpen(false)}
        title="Create Branch / District"
        subtitle="Segment daily operations and manager approvals by location or unit"
      >
        <form onSubmit={handleCreateBranch} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Branch / District Name *
            </label>
            <input
              type="text"
              required
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="e.g., Chattogram District"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Branch Code *
            </label>
            <input
              type="text"
              required
              value={branchCode}
              onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
              placeholder="e.g., CTG-01"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-[#0284C7]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Address (Optional)
            </label>
            <input
              type="text"
              value={branchAddress}
              onChange={(e) => setBranchAddress(e.target.value)}
              placeholder="Agrabad, Chattogram"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setBranchModalOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingBranch}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0284C7] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0369A1] disabled:opacity-60"
            >
              {savingBranch && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create Branch
            </button>
          </div>
        </form>
      </Modal>

      {/* Provision User Modal */}
      <Modal
        open={memberModalOpen}
        onClose={() => setMemberModalOpen(false)}
        title={isBranchManager ? "Add Branch Employee" : "Provision Team Account"}
        subtitle="Users sign in with your Company Code + Employee ID or Email"
      >
        <form onSubmit={handleCreateMember} className="space-y-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Full Name *
              </label>
              <input
                type="text"
                required
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="Karim Uddin"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Employee ID *
              </label>
              <input
                type="text"
                required
                value={memberCode}
                onChange={(e) => setMemberCode(e.target.value.toUpperCase())}
                placeholder="e.g., SHL-CTG-01"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-[#0284C7]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Email *
              </label>
              <input
                type="email"
                required
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                placeholder="karim@shilpalay.com"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Phone (Optional)
              </label>
              <input
                type="tel"
                value={memberPhone}
                onChange={(e) => setMemberPhone(e.target.value)}
                placeholder="017XXXXXXXX"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
              />
            </div>
          </div>

          {!isBranchManager && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  Role *
                </label>
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value as CompanyRole)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
                >
                  <option value="COMPANY_SUPER_ADMIN">
                    Co-Admin / Managing Director
                  </option>
                  <option value="HQ_ADMIN_OFFICER">HQ Admin Officer</option>
                  <option value="BRANCH_MANAGER">Branch Manager</option>
                  <option value="EMPLOYEE">Employee</option>
                </select>
              </div>
              {memberRole !== "HQ_ADMIN_OFFICER" &&
                memberRole !== "COMPANY_SUPER_ADMIN" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    Assigned Branch *
                  </label>
                  <select
                    required
                    value={memberBranchId}
                    onChange={(e) => setMemberBranchId(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Initial Password *
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={memberPassword}
              onChange={(e) => setMemberPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0284C7]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setMemberModalOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingMember}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0284C7] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0369A1] disabled:opacity-60"
            >
              {savingMember && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create Account
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
