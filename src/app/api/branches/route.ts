import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import dbConnect from "@/lib/dbConnect";
import { getTenantAuthContext, isHQOrSuperAdmin } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { Branch, User } from "@/models";

const createBranchSchema = z.object({
  name: z.string().trim().min(2, "Branch/District name is required").max(120),
  code: z
    .string()
    .trim()
    .min(2, "Branch code is required")
    .max(30)
    .regex(/^[A-Za-z0-9_-]+$/, "Use letters, numbers, or hyphens only"),
  address: z.string().trim().max(300).optional(),
});

const updateBranchSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().trim().min(2).max(120).optional(),
  address: z.string().trim().max(300).optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  try {
    await dbConnect();

    const filter: Record<string, unknown> = {
      companyId: new Types.ObjectId(auth.ctx.companyId),
      isActive: true,
    };

    if (!isHQOrSuperAdmin(auth.ctx.role) && auth.ctx.branchId) {
      filter._id = new Types.ObjectId(auth.ctx.branchId);
    }

    const [branches, staffCounts] = await Promise.all([
      Branch.find(filter)
        .sort({ name: 1 })
        .populate("managerId", "name email employeeCode")
        .lean(),
      User.aggregate([
        {
          $match: {
            companyId: new Types.ObjectId(auth.ctx.companyId),
            isActive: true,
          },
        },
        { $group: { _id: "$branchId", count: { $sum: 1 } } },
      ]),
    ]);

    const countMap = new Map(
      staffCounts
        .filter((s) => s._id)
        .map((s) => [s._id.toString(), s.count as number])
    );

    const items = branches.map((b) => {
      const manager = b.managerId as unknown as {
        _id?: { toString(): string };
        name?: string;
        email?: string;
        employeeCode?: string;
      } | null;

      return {
        id: b._id.toString(),
        name: b.name,
        code: b.code,
        address: b.address || "",
        staffCount: countMap.get(b._id.toString()) || 0,
        manager: manager
          ? {
              id: manager._id?.toString() || "",
              name: manager.name || "",
              email: manager.email || "",
              employeeCode: manager.employeeCode || "",
            }
          : null,
      };
    });

    return NextResponse.json({ branches: items });
  } catch (error) {
    console.error("[GET /api/branches] Error:", error);
    return NextResponse.json(
      { error: "Failed to load branches." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  if (auth.ctx.role !== "COMPANY_SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Only the Company Super Admin (MD) can create branches." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const parsed = createBranchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid branch details" },
        { status: 400 }
      );
    }

    await dbConnect();
    const normalizedCode = parsed.data.code.toUpperCase();

    const exists = await Branch.exists({
      companyId: auth.ctx.companyId,
      code: normalizedCode,
    });
    if (exists) {
      return NextResponse.json(
        { error: `Branch code "${normalizedCode}" already exists.` },
        { status: 409 }
      );
    }

    const branch = await Branch.create({
      companyId: auth.ctx.companyId,
      name: parsed.data.name,
      code: normalizedCode,
      address: parsed.data.address,
      isActive: true,
    });

    await recordAuditLog({
      companyId: auth.ctx.companyId,
      actorId: auth.ctx.userId,
      action: "CREATE",
      entityType: "BRANCH",
      entityId: branch._id,
      summary: `Created branch "${branch.name}" (${branch.code})`,
    });

    return NextResponse.json(
      {
        message: "Branch created successfully.",
        branch: {
          id: branch._id.toString(),
          name: branch.name,
          code: branch.code,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/branches] Error:", error);
    return NextResponse.json(
      { error: "Failed to create branch." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  if (auth.ctx.role !== "COMPANY_SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Only the Company Super Admin can update branches." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const parsed = updateBranchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    await dbConnect();
    const branch = await Branch.findOne({
      _id: parsed.data.branchId,
      companyId: auth.ctx.companyId,
    });

    if (!branch) {
      return NextResponse.json({ error: "Branch not found." }, { status: 404 });
    }

    if (parsed.data.name) branch.name = parsed.data.name;
    if (parsed.data.address !== undefined) branch.address = parsed.data.address;
    if (parsed.data.isActive !== undefined) branch.isActive = parsed.data.isActive;
    await branch.save();

    await recordAuditLog({
      companyId: auth.ctx.companyId,
      actorId: auth.ctx.userId,
      action: "UPDATE",
      entityType: "BRANCH",
      entityId: branch._id,
      summary: `Updated branch "${branch.name}" (${branch.code})`,
    });

    return NextResponse.json({ message: "Branch updated." });
  } catch (error) {
    console.error("[PATCH /api/branches] Error:", error);
    return NextResponse.json(
      { error: "Failed to update branch." },
      { status: 500 }
    );
  }
}
