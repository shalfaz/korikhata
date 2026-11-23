import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { z } from "zod";
import dbConnect from "@/lib/dbConnect";
import { getTenantAuthContext, isHQOrSuperAdmin } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { Branch, COMPANY_ROLES, User } from "@/models";

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
  branchId: z.string().optional(),
  password: z.string().min(6, "Password must be at least 6 characters").max(100),
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

  if (auth.ctx.role === "EMPLOYEE") {
    return NextResponse.json(
      { error: "Employees cannot view the organization directory." },
      { status: 403 }
    );
  }

  try {
    await dbConnect();

    const filter: Record<string, unknown> = {
      companyId: new Types.ObjectId(auth.ctx.companyId),
      isPlatformAdmin: false,
    };

    if (auth.ctx.role === "BRANCH_MANAGER") {
      if (!auth.ctx.branchId) {
        return NextResponse.json({ members: [] });
      }
      filter.branchId = new Types.ObjectId(auth.ctx.branchId);
    }

    const users = await User.find(filter)
      .sort({ role: 1, name: 1 })
      .populate("branchId", "name code")
      .select("name email employeeCode phone role branchId isActive createdAt")
      .lean();

    const members = users.map((u) => {
      const branch = u.branchId as unknown as {
        _id?: { toString(): string };
        name?: string;
        code?: string;
      } | null;

      return {
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        employeeCode: u.employeeCode || "",
        phone: u.phone || "",
        role: u.role,
        branch: branch
          ? {
              id: branch._id?.toString() || "",
              name: branch.name || "",
              code: branch.code || "",
            }
          : null,
        isActive: u.isActive,
        createdAt: u.createdAt,
      };
    });

    return NextResponse.json({
      members,
      canManageBranches: auth.ctx.role === "COMPANY_SUPER_ADMIN",
      canCreateRoles:
        auth.ctx.role === "COMPANY_SUPER_ADMIN"
          ? [
              "COMPANY_SUPER_ADMIN",
              "HQ_ADMIN_OFFICER",
              "BRANCH_MANAGER",
              "EMPLOYEE",
            ]
          : auth.ctx.role === "BRANCH_MANAGER"
          ? ["EMPLOYEE"]
          : [],
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
  if (callerRole !== "COMPANY_SUPER_ADMIN" && callerRole !== "BRANCH_MANAGER") {
    return NextResponse.json(
      { error: "Only Company Super Admins and Branch Managers can provision accounts." },
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

    // Enforce hierarchical role provisioning rules
    if (callerRole === "BRANCH_MANAGER") {
      if (data.role !== "EMPLOYEE") {
        return NextResponse.json(
          { error: "Branch Managers can only provision EMPLOYEE accounts." },
          { status: 403 }
        );
      }
      if (!auth.ctx.branchId) {
        return NextResponse.json(
          { error: "Your manager account is not assigned to a branch." },
          { status: 400 }
        );
      }
    }

    await dbConnect();

    const targetBranchId =
      callerRole === "BRANCH_MANAGER"
        ? auth.ctx.branchId
        : data.role === "COMPANY_SUPER_ADMIN" ||
          data.role === "HQ_ADMIN_OFFICER"
        ? null
        : data.branchId && Types.ObjectId.isValid(data.branchId)
        ? data.branchId
        : null;

    if (
      (data.role === "BRANCH_MANAGER" || data.role === "EMPLOYEE") &&
      !targetBranchId
    ) {
      return NextResponse.json(
        { error: "A branch/district assignment is required for Branch Managers and Employees." },
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
        { error: `Employee ID "${normalizedEmpCode}" is already used in this company.` },
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

    if (data.role === "BRANCH_MANAGER" && targetBranchId) {
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
        message: `${newUser.name} (${normalizedEmpCode}) created successfully.`,
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
    return NextResponse.json(
      { error: "Failed to provision user account." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  if (
    auth.ctx.role !== "COMPANY_SUPER_ADMIN" &&
    auth.ctx.role !== "BRANCH_MANAGER"
  ) {
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

    if (auth.ctx.role === "BRANCH_MANAGER") {
      if (
        targetUser.role !== "EMPLOYEE" ||
        targetUser.branchId?.toString() !== auth.ctx.branchId
      ) {
        return NextResponse.json(
          { error: "Branch Managers can only manage employees in their own branch." },
          { status: 403 }
        );
      }
      if (parsed.data.isActive !== undefined) {
        targetUser.isActive = parsed.data.isActive;
      }
    } else if (isHQOrSuperAdmin(auth.ctx.role)) {
      if (parsed.data.role && parsed.data.role !== "COMPANY_SUPER_ADMIN") {
        targetUser.role = parsed.data.role;
      }
      if (parsed.data.branchId !== undefined) {
        targetUser.branchId =
          parsed.data.branchId && Types.ObjectId.isValid(parsed.data.branchId)
            ? new Types.ObjectId(parsed.data.branchId)
            : undefined;
      }
      if (parsed.data.isActive !== undefined) {
        targetUser.isActive = parsed.data.isActive;
      }
    }

    await targetUser.save();

    await recordAuditLog({
      companyId: auth.ctx.companyId,
      actorId: auth.ctx.userId,
      action: "UPDATE",
      entityType: "TEAM_MEMBER",
      entityId: targetUser._id,
      summary: `Updated account settings for ${targetUser.name} (${targetUser.employeeCode || targetUser.email})`,
    });

    return NextResponse.json({ message: "Account updated." });
  } catch (error) {
    console.error("[PATCH /api/team] Error:", error);
    return NextResponse.json(
      { error: "Failed to update user account." },
      { status: 500 }
    );
  }
}
