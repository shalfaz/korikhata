import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { z } from "zod";
import dbConnect from "@/lib/dbConnect";
import {
  canManageTargetUser,
  canManageUsers,
  getManageableRoles,
  getTenantAuthContext,
} from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { Branch, COMPANY_ROLES, CompanyRole, ROLE_RANK, User } from "@/models";

const createMemberSchema = z.object({
  name: z.string().trim().min(2, "Full name is required").max(100),
  email: z.string().trim().email("Valid email is required"),
  employeeCode: z
    .string()
    .trim()
    .min(2, "Employee ID is required (e.g., SHL-DHK-01)")
    .max(40),
  phone: z.string().trim().max(30).optional(),
  role: z.enum(COMPANY_ROLES),
  branchId: z.string().nullable().optional(),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(100),
});

const updateMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(COMPANY_ROLES).optional(),
  branchId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  if (!canManageUsers(auth.ctx.role)) {
    return NextResponse.json(
      {
        error:
          "You do not have permission to manage organization team accounts.",
      },
      { status: 403 }
    );
  }

  try {
    await dbConnect();

    const filter: Record<string, unknown> = {
      companyId: new Types.ObjectId(auth.ctx.companyId),
      isPlatformAdmin: false,
    };

    if (auth.ctx.role === "BRANCH_ADMIN") {
      if (!auth.ctx.branchId) {
        return NextResponse.json({
          members: [],
          canManageBranches: false,
          manageableRoles: getManageableRoles(auth.ctx.role),
        });
      }
      filter.branchId = new Types.ObjectId(auth.ctx.branchId);
    }

    const users = await User.find(filter)
      .sort({ name: 1 })
      .populate("branchId", "name code")
      .select("name email employeeCode phone role branchId isActive createdAt")
      .lean();

    const members = users
      .map((u) => {
        const branch = u.branchId as unknown as {
          _id?: { toString(): string };
          name?: string;
          code?: string;
        } | null;

        const normalizedRole: CompanyRole =
          (u.role as string) === "HQ_ADMIN_OFFICER" ? "HQ_ADMIN" : u.role;
        const targetBranchId = branch?._id?.toString() || null;

        return {
          id: u._id.toString(),
          name: u.name,
          email: u.email,
          employeeCode: u.employeeCode || "",
          phone: u.phone || "",
          role: normalizedRole,
          branch: branch
            ? {
                id: targetBranchId || "",
                name: branch.name || "",
                code: branch.code || "",
              }
            : null,
          isActive: u.isActive,
          canManage:
            u._id.toString() !== auth.ctx.userId &&
            canManageTargetUser(
              auth.ctx.role,
              auth.ctx.branchId,
              normalizedRole,
              targetBranchId
            ),
          createdAt: u.createdAt,
        };
      })
      .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role]);

    return NextResponse.json({
      members,
      canManageBranches: auth.ctx.role === "COMPANY_SUPER_ADMIN",
      manageableRoles: getManageableRoles(auth.ctx.role),
    });
  } catch (error) {
    console.error("[GET /api/team] Error:", error);
    return NextResponse.json(
      { error: "Failed to load team directory." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  const callerRole = auth.ctx.role;
  const manageableRoles = getManageableRoles(callerRole);

  if (manageableRoles.length === 0) {
    return NextResponse.json(
      { error: "You do not have permission to provision team accounts." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const parsed = createMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid member details" },
        { status: 400 }
      );
    }

    const data = parsed.data;

    if (data.role === "COMPANY_SUPER_ADMIN") {
      return NextResponse.json(
        {
          error:
            "Only one Company Super Admin (MD) is allowed per organization.",
        },
        { status: 403 }
      );
    }

    if (!manageableRoles.includes(data.role)) {
      return NextResponse.json(
        {
          error: `Your role (${callerRole}) can only provision roles strictly below your tier.`,
        },
        { status: 403 }
      );
    }

    await dbConnect();

    let targetBranchId: string | null = null;
    if (callerRole === "BRANCH_ADMIN") {
      if (!auth.ctx.branchId) {
        return NextResponse.json(
          { error: "Your Branch Admin account is not assigned to a branch." },
          { status: 400 }
        );
      }
      targetBranchId = auth.ctx.branchId;
    } else if (data.role !== "HQ_ADMIN") {
      targetBranchId =
        data.branchId && Types.ObjectId.isValid(data.branchId)
          ? data.branchId
          : null;
    }

    if (data.role !== "HQ_ADMIN" && !targetBranchId) {
      return NextResponse.json(
        {
          error:
            "A branch/district assignment is required for Branch Admin, Branch Manager, and Employee accounts.",
        },
        { status: 400 }
      );
    }

    if (targetBranchId) {
      const branchValid = await Branch.exists({
        _id: targetBranchId,
        companyId: auth.ctx.companyId,
        isActive: true,
      });
      if (!branchValid) {
        return NextResponse.json(
          { error: "Selected branch does not belong to this organization." },
          { status: 400 }
        );
      }
    }

    const normalizedEmail = data.email.toLowerCase();
    const normalizedEmpCode = data.employeeCode.toUpperCase();

    const [emailExists, codeExists] = await Promise.all([
      User.exists({ email: normalizedEmail }),
      User.exists({
        companyId: auth.ctx.companyId,
        employeeCode: normalizedEmpCode,
      }),
    ]);

    if (emailExists) {
      return NextResponse.json(
        { error: `Email "${normalizedEmail}" is already registered.` },
        { status: 409 }
      );
    }
    if (codeExists) {
      return NextResponse.json(
        {
          error: `Employee ID "${normalizedEmpCode}" is already used in this company.`,
        },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    const newUser = await User.create({
      name: data.name,
      email: normalizedEmail,
      employeeCode: normalizedEmpCode,
      phone: data.phone,
      passwordHash,
      authProvider: "credentials",
      isPlatformAdmin: false,
      companyId: auth.ctx.companyId,
      branchId: targetBranchId || undefined,
      role: data.role,
      isActive: true,
    });

    if (
      (data.role === "BRANCH_MANAGER" || data.role === "BRANCH_ADMIN") &&
      targetBranchId
    ) {
      await Branch.updateOne(
        { _id: targetBranchId, companyId: auth.ctx.companyId },
        { $set: { managerId: newUser._id } }
      );
    }

    await recordAuditLog({
      companyId: auth.ctx.companyId,
      actorId: auth.ctx.userId,
      action: "CREATE",
      entityType: "TEAM_MEMBER",
      entityId: newUser._id,
      summary: `Provisioned ${newUser.name} (${normalizedEmpCode}) as ${data.role}`,
    });

    return NextResponse.json(
      {
        message: `${newUser.name} (${normalizedEmpCode}) provisioned as ${data.role}.`,
        member: {
          id: newUser._id.toString(),
          name: newUser.name,
          email: newUser.email,
          employeeCode: newUser.employeeCode,
          role: newUser.role,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/team] Error:", error);
    const err = error as {
      name?: string;
      code?: number;
      message?: string;
      errors?: Record<string, { message?: string }>;
    };

    if (err?.code === 11000) {
      return NextResponse.json(
        { error: "Duplicate email or Employee ID already exists." },
        { status: 409 }
      );
    }

    if (err?.name === "ValidationError" && err.errors) {
      const firstValidationMsg = Object.values(err.errors)[0]?.message;
      return NextResponse.json(
        { error: firstValidationMsg || err.message || "Validation error." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error:
          err?.message || "Failed to provision user account.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  const manageableRoles = getManageableRoles(auth.ctx.role);
  if (manageableRoles.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const parsed = updateMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    if (parsed.data.userId === auth.ctx.userId) {
      return NextResponse.json(
        { error: "You cannot modify your own status or role." },
        { status: 400 }
      );
    }

    await dbConnect();
    const targetUser = await User.findOne({
      _id: parsed.data.userId,
      companyId: auth.ctx.companyId,
      isPlatformAdmin: false,
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const currentTargetRole: CompanyRole =
      (targetUser.role as string) === "HQ_ADMIN_OFFICER"
        ? "HQ_ADMIN"
        : targetUser.role;

    const allowed = canManageTargetUser(
      auth.ctx.role,
      auth.ctx.branchId,
      currentTargetRole,
      targetUser.branchId?.toString() || null
    );

    if (!allowed) {
      return NextResponse.json(
        {
          error:
            "Forbidden: You can only edit accounts strictly below your rank within your authorized scope.",
        },
        { status: 403 }
      );
    }

    if (parsed.data.role) {
      if (!manageableRoles.includes(parsed.data.role)) {
        return NextResponse.json(
          { error: `You cannot assign the role ${parsed.data.role}.` },
          { status: 403 }
        );
      }
      targetUser.role = parsed.data.role;
    }

    const resultingRole = targetUser.role;

    if (resultingRole === "HQ_ADMIN") {
      targetUser.branchId = undefined;
    } else if (
      auth.ctx.role !== "BRANCH_ADMIN" &&
      parsed.data.branchId !== undefined
    ) {
      if (parsed.data.branchId && Types.ObjectId.isValid(parsed.data.branchId)) {
        const branchValid = await Branch.exists({
          _id: parsed.data.branchId,
          companyId: auth.ctx.companyId,
          isActive: true,
        });
        if (!branchValid) {
          return NextResponse.json(
            { error: "Invalid branch assignment." },
            { status: 400 }
          );
        }
        targetUser.branchId = new Types.ObjectId(parsed.data.branchId);
      } else {
        return NextResponse.json(
          { error: "A branch assignment is required for this role." },
          { status: 400 }
        );
      }
    }

    if (parsed.data.isActive !== undefined) {
      targetUser.isActive = parsed.data.isActive;
    }

    await targetUser.save();

    await recordAuditLog({
      companyId: auth.ctx.companyId,
      actorId: auth.ctx.userId,
      action: "UPDATE",
      entityType: "TEAM_MEMBER",
      entityId: targetUser._id,
      summary: `Updated ${targetUser.name} (${targetUser.employeeCode || targetUser.email}) — Role: ${targetUser.role}, Active: ${targetUser.isActive}`,
    });

    return NextResponse.json({ message: "Account updated successfully." });
  } catch (error) {
    console.error("[PATCH /api/team] Error:", error);
    const err = error as {
      name?: string;
      message?: string;
      errors?: Record<string, { message?: string }>;
    };
    if (err?.name === "ValidationError" && err.errors) {
      const firstValidationMsg = Object.values(err.errors)[0]?.message;
      return NextResponse.json(
        { error: firstValidationMsg || err.message || "Validation error." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: err?.message || "Failed to update user account." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  if (!canManageUsers(auth.ctx.role)) {
    return NextResponse.json(
      { error: "You do not have permission to remove team accounts." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const userId = typeof body?.userId === "string" ? body.userId : "";
    if (!Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ error: "Invalid userId." }, { status: 400 });
    }

    if (userId === auth.ctx.userId) {
      return NextResponse.json(
        { error: "You cannot remove your own account." },
        { status: 400 }
      );
    }

    await dbConnect();

    const targetUser = await User.findOne({
      _id: userId,
      companyId: auth.ctx.companyId,
      isPlatformAdmin: false,
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const currentTargetRole: CompanyRole =
      (targetUser.role as string) === "HQ_ADMIN_OFFICER"
        ? "HQ_ADMIN"
        : targetUser.role;

    const allowed = canManageTargetUser(
      auth.ctx.role,
      auth.ctx.branchId,
      currentTargetRole,
      targetUser.branchId?.toString() || null
    );

    if (!allowed) {
      return NextResponse.json(
        {
          error:
            "Forbidden: You can only remove accounts strictly below your rank within your authorized scope.",
        },
        { status: 403 }
      );
    }

    await Branch.updateMany(
      { companyId: auth.ctx.companyId, managerId: targetUser._id },
      { $unset: { managerId: "" } }
    );

    await User.deleteOne({ _id: targetUser._id });

    await recordAuditLog({
      companyId: auth.ctx.companyId,
      actorId: auth.ctx.userId,
      action: "SOFT_DELETE",
      entityType: "TEAM_MEMBER",
      entityId: targetUser._id,
      summary: `Revoked & removed ${targetUser.name} (${targetUser.employeeCode || targetUser.email}) [${currentTargetRole}]`,
    });

    return NextResponse.json({
      message: `Removed ${targetUser.name} from organization.`,
    });
  } catch (error) {
    console.error("[DELETE /api/team] Error:", error);
    return NextResponse.json(
      { error: "Failed to remove team account." },
      { status: 500 }
    );
  }
}
