import { NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import {
  ApprovalStatus,
  ApprovalWorkflow,
  Branch,
  Company,
  CompanyRole,
  PlatformRole,
  ROLE_RANK,
  User,
} from "@/models";

function normalizeCompanyRole(rawRole: string | undefined): CompanyRole {
  if (rawRole === "HQ_ADMIN_OFFICER") return "HQ_ADMIN";
  if (
    rawRole === "COMPANY_SUPER_ADMIN" ||
    rawRole === "HQ_ADMIN" ||
    rawRole === "BRANCH_ADMIN" ||
    rawRole === "BRANCH_MANAGER" ||
    rawRole === "EMPLOYEE"
  ) {
    return rawRole;
  }
  return "EMPLOYEE";
}

async function hydrateSessionUser(userId: string) {
  await dbConnect();

  const user = await User.findById(userId).lean();
  if (!user || !user.isActive) {
    return null;
  }

  if (user.isPlatformAdmin) {
    const resolvedPlatformRole: PlatformRole =
      user.platformRole || "ROOT_OWNER";
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      employeeCode: user.employeeCode ?? "PLATFORM",
      image: user.image ?? null,
      isPlatformAdmin: true,
      platformRole: resolvedPlatformRole,
      companyId: null,
      companyCode: null,
      companyName: "KoriKhata Platform",
      approvalWorkflow: null,
      branchId: null,
      branchName: null,
      role: "COMPANY_SUPER_ADMIN" as CompanyRole,
    };
  }

  const [company, branch] = await Promise.all([
    user.companyId
      ? Company.findOne({ _id: user.companyId, isActive: true })
          .select("_id name companyCode approvalWorkflow subscription")
          .lean()
      : null,
    user.branchId
      ? Branch.findOne({ _id: user.branchId, isActive: true })
          .select("_id name code")
          .lean()
      : null,
  ]);

  if (!company) {
    return null;
  }

  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    employeeCode: user.employeeCode ?? null,
    image: user.image ?? null,
    isPlatformAdmin: false,
    platformRole: null as PlatformRole | null,
    companyId: company._id.toString(),
    companyCode: company.companyCode,
    companyName: company.name,
    approvalWorkflow: company.approvalWorkflow,
    branchId: branch ? branch._id.toString() : null,
    branchName: branch ? branch.name : null,
    role: normalizeCompanyRole(user.role),
  };
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Company ERP Credentials",
      credentials: {
        companyCode: { label: "Company Code", type: "text" },
        identifier: { label: "Email or Employee ID", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const identifier = credentials?.identifier?.trim();
        const password = credentials?.password;
        const companyCode = credentials?.companyCode?.trim().toUpperCase();

        if (!identifier || !password) {
          throw new Error("Please enter your Employee ID / Email and password.");
        }

        await dbConnect();

        // 1. Platform Admin login (when companyCode is empty or "PLATFORM")
        if (!companyCode || companyCode === "PLATFORM") {
          const adminUser = await User.findOne({
            isPlatformAdmin: true,
            isActive: true,
            email: identifier.toLowerCase(),
          }).select("+passwordHash");

          if (adminUser && adminUser.passwordHash) {
            const valid = await bcrypt.compare(password, adminUser.passwordHash);
            if (!valid) {
              throw new Error("Invalid credentials.");
            }
            return {
              id: adminUser._id.toString(),
              name: adminUser.name,
              email: adminUser.email,
              isPlatformAdmin: true,
            };
          }

          if (!companyCode) {
            throw new Error("Company Code is required for organization login.");
          }
        }

        // 2. Company-scoped user login
        const company = await Company.findOne({
          companyCode,
          isActive: true,
        }).lean();

        if (!company) {
          throw new Error(`Invalid Company Code "${companyCode}".`);
        }

        if (
          company.subscription?.status === "SUSPENDED" ||
          company.subscription?.status === "CANCELLED"
        ) {
          throw new Error(
            "This organization workspace is currently suspended. Contact KoriKhata Admin."
          );
        }

        const user = await User.findOne({
          companyId: company._id,
          isActive: true,
          $or: [
            { email: identifier.toLowerCase() },
            { employeeCode: identifier.toUpperCase() },
          ],
        }).select("+passwordHash");

        if (!user || !user.passwordHash) {
          throw new Error("Invalid Employee ID / Email or password.");
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          throw new Error("Invalid Employee ID / Email or password.");
        }

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          isPlatformAdmin: false,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      const targetUserId = user?.id || token.id;
      if (targetUserId && (user || trigger === "update" || !token.role)) {
        const state = await hydrateSessionUser(targetUserId);
        if (state) {
          token.id = state.id;
          token.name = state.name;
          token.email = state.email;
          token.employeeCode = state.employeeCode;
          token.picture = state.image ?? undefined;
          token.isPlatformAdmin = state.isPlatformAdmin;
          token.platformRole = state.platformRole;
          token.companyId = state.companyId;
          token.companyCode = state.companyCode;
          token.companyName = state.companyName;
          token.approvalWorkflow = state.approvalWorkflow;
          token.branchId = state.branchId;
          token.branchName = state.branchName;
          token.role = state.role;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.name = token.name || session.user.name || "";
        session.user.email = token.email || session.user.email || "";
        session.user.employeeCode = token.employeeCode ?? null;
        session.user.image = (token.picture as string | undefined) ?? null;
        session.user.isPlatformAdmin = Boolean(token.isPlatformAdmin);
        session.user.platformRole = token.platformRole ?? null;
        session.user.companyId = token.companyId ?? null;
        session.user.companyCode = token.companyCode ?? null;
        session.user.companyName = token.companyName ?? null;
        session.user.approvalWorkflow = token.approvalWorkflow ?? null;
        session.user.branchId = token.branchId ?? null;
        session.user.branchName = token.branchName ?? null;
        session.user.role = token.role || "EMPLOYEE";
      }
      return session;
    },
  },
};

export interface TenantAuthContext {
  userId: string;
  userName: string;
  userEmail: string;
  employeeCode: string | null;
  companyId: string;
  companyCode: string;
  companyName: string;
  approvalWorkflow: ApprovalWorkflow;
  branchId: string | null;
  branchName: string | null;
  role: CompanyRole;
}

/**
 * Verifies authenticated session bound to a single active organization.
 */
export async function getTenantAuthContext(): Promise<
  | { ok: true; ctx: TenantAuthContext }
  | { ok: false; response: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 }
      ),
    };
  }

  if (session.user.isPlatformAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Platform Admin accounts must use the Platform Admin portal." },
        { status: 403 }
      ),
    };
  }

  const state = await hydrateSessionUser(session.user.id);
  if (!state || !state.companyId || !state.companyCode || !state.companyName) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Account or organization is inactive." },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    ctx: {
      userId: state.id,
      userName: state.name,
      userEmail: state.email,
      employeeCode: state.employeeCode,
      companyId: state.companyId,
      companyCode: state.companyCode,
      companyName: state.companyName,
      approvalWorkflow: state.approvalWorkflow || "3_STEP",
      branchId: state.branchId,
      branchName: state.branchName,
      role: state.role,
    },
  };
}

/**
 * Verifies authenticated KoriKhata Platform Admin session (ROOT_OWNER or PLATFORM_ADMIN).
 */
export async function getPlatformAdminContext(): Promise<
  | {
      ok: true;
      admin: {
        userId: string;
        name: string;
        email: string;
        platformRole: PlatformRole;
      };
    }
  | { ok: false; response: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.isPlatformAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden: Platform Admin access required." },
        { status: 403 }
      ),
    };
  }

  await dbConnect();
  const admin = await User.findOne({
    _id: session.user.id,
    isPlatformAdmin: true,
    isActive: true,
  })
    .select("_id name email platformRole")
    .lean();

  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Platform Admin account not found." },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    admin: {
      userId: admin._id.toString(),
      name: admin.name,
      email: admin.email,
      platformRole: admin.platformRole || "ROOT_OWNER",
    },
  };
}

/**
 * Verifies authenticated KoriKhata Platform Root Owner session.
 */
export async function getRootOwnerContext() {
  const auth = await getPlatformAdminContext();
  if (!auth.ok) return auth;

  if (auth.admin.platformRole !== "ROOT_OWNER") {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Forbidden: Only the Platform Root Owner can manage Platform Admins." },
        { status: 403 }
      ),
    };
  }

  return auth;
}

/**
 * Determines the starting approval status when a user submits a transaction.
 */
export function getInitialApprovalStatus(
  role: CompanyRole,
  workflow: ApprovalWorkflow
): ApprovalStatus {
  if (role === "COMPANY_SUPER_ADMIN") {
    return "FINAL_APPROVED";
  }
  if (role === "HQ_ADMIN") {
    return "PENDING_FINAL";
  }
  if (role === "BRANCH_ADMIN" || role === "BRANCH_MANAGER") {
    return workflow === "3_STEP" ? "PENDING_HQ" : "PENDING_FINAL";
  }
  // EMPLOYEE
  if (workflow === "1_STEP") return "PENDING_FINAL";
  return "PENDING_MANAGER";
}

/**
 * Determines the primary pending queue status that a given role approves.
 */
export function getQueueStatusForRole(role: CompanyRole): ApprovalStatus | null {
  if (role === "BRANCH_MANAGER" || role === "BRANCH_ADMIN") {
    return "PENDING_MANAGER";
  }
  if (role === "HQ_ADMIN") return "PENDING_HQ";
  if (role === "COMPANY_SUPER_ADMIN") return "PENDING_FINAL";
  return null;
}

/**
 * Computes the next approval status after an authorized approver approves an entry.
 */
export function getNextApprovalStatus(
  currentStatus: ApprovalStatus,
  approverRole: CompanyRole,
  workflow: ApprovalWorkflow
): ApprovalStatus | null {
  if (approverRole === "COMPANY_SUPER_ADMIN") {
    return "FINAL_APPROVED";
  }

  if (approverRole === "HQ_ADMIN") {
    if (currentStatus === "PENDING_HQ" || currentStatus === "PENDING_FINAL") {
      return "FINAL_APPROVED";
    }
    return null;
  }

  if (
    currentStatus === "PENDING_MANAGER" &&
    (approverRole === "BRANCH_MANAGER" || approverRole === "BRANCH_ADMIN")
  ) {
    return workflow === "3_STEP" ? "PENDING_HQ" : "PENDING_FINAL";
  }

  return null;
}

export function isHQOrSuperAdmin(role: CompanyRole): boolean {
  return role === "COMPANY_SUPER_ADMIN" || role === "HQ_ADMIN";
}

export function isBranchScopedApprover(role: CompanyRole): boolean {
  return role === "BRANCH_ADMIN" || role === "BRANCH_MANAGER";
}

export function canManageUsers(role: CompanyRole): boolean {
  return (
    role === "COMPANY_SUPER_ADMIN" ||
    role === "HQ_ADMIN" ||
    role === "BRANCH_ADMIN"
  );
}

/**
 * Returns roles strictly lower in rank than the actor (never COMPANY_SUPER_ADMIN).
 */
export function getManageableRoles(actorRole: CompanyRole): CompanyRole[] {
  if (actorRole === "COMPANY_SUPER_ADMIN") {
    return ["HQ_ADMIN", "BRANCH_ADMIN", "BRANCH_MANAGER", "EMPLOYEE"];
  }
  if (actorRole === "HQ_ADMIN") {
    return ["BRANCH_ADMIN", "BRANCH_MANAGER", "EMPLOYEE"];
  }
  if (actorRole === "BRANCH_ADMIN") {
    return ["BRANCH_MANAGER", "EMPLOYEE"];
  }
  return [];
}

/**
 * Enforces cascading hierarchical permissions: actor must outrank target,
 * target can never be COMPANY_SUPER_ADMIN, and BRANCH_ADMIN is locked to their own branch.
 */
export function canManageTargetUser(
  actorRole: CompanyRole,
  actorBranchId: string | null,
  targetRole: CompanyRole,
  targetBranchId: string | null
): boolean {
  if (!canManageUsers(actorRole)) return false;
  if (targetRole === "COMPANY_SUPER_ADMIN") return false;
  if (ROLE_RANK[actorRole] <= ROLE_RANK[targetRole]) return false;

  if (actorRole === "BRANCH_ADMIN") {
    return Boolean(
      actorBranchId && targetBranchId && actorBranchId === targetBranchId
    );
  }
  return true;
}

export function canManageDues(role: CompanyRole): boolean {
  return role !== "EMPLOYEE";
}

export function canDeleteTransactions(role: CompanyRole): boolean {
  return role === "COMPANY_SUPER_ADMIN";
}
