import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import dbConnect from "@/lib/dbConnect";
import { getPlatformAdminContext } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import {
  APPROVAL_WORKFLOWS,
  Branch,
  Company,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_STATUSES,
  User,
} from "@/models";
import { generateCompanySlug } from "@/lib/utils";

const provisionCompanySchema = z.object({
  name: z.string().trim().min(2, "Company name is required").max(120),
  companyCode: z
    .string()
    .trim()
    .min(2, "Company code must be 2–24 characters")
    .max(24)
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "Company code can only contain letters, numbers, hyphens, or underscores"
    ),
  businessType: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  approvalWorkflow: z.enum(APPROVAL_WORKFLOWS).default("3_STEP"),
  plan: z.enum(SUBSCRIPTION_PLANS).default("ENTERPRISE"),
  subscriptionStatus: z.enum(SUBSCRIPTION_STATUSES).default("ACTIVE"),
  hqBranchName: z.string().trim().min(2).max(120).default("Head Office - Dhaka"),
  adminName: z.string().trim().min(2, "MD / Super Admin name is required").max(100),
  adminEmail: z.string().trim().email("Valid MD / Super Admin email is required"),
  adminEmployeeCode: z.string().trim().min(2).max(30).optional(),
  adminPassword: z
    .string()
    .min(6, "Initial password must be at least 6 characters")
    .max(100),
});

const updateCompanyStatusSchema = z.object({
  companyId: z.string().min(1),
  subscriptionStatus: z.enum(SUBSCRIPTION_STATUSES).optional(),
  plan: z.enum(SUBSCRIPTION_PLANS).optional(),
  approvalWorkflow: z.enum(APPROVAL_WORKFLOWS).optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const auth = await getPlatformAdminContext();
  if (!auth.ok) return auth.response;

  try {
    await dbConnect();

    const companies = await Company.find()
      .sort({ createdAt: -1 })
      .populate("ownerId", "name email employeeCode")
      .lean();

    const [branchCounts, userCounts] = await Promise.all([
      Branch.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: "$companyId", count: { $sum: 1 } } },
      ]),
      User.aggregate([
        { $match: { isPlatformAdmin: false, isActive: true } },
        { $group: { _id: "$companyId", count: { $sum: 1 } } },
      ]),
    ]);

    const branchMap = new Map(
      branchCounts.map((b) => [b._id.toString(), b.count as number])
    );
    const userMap = new Map(
      userCounts.map((u) => [u._id.toString(), u.count as number])
    );

    const items = companies.map((c) => {
      const owner = c.ownerId as unknown as {
        name?: string;
        email?: string;
        employeeCode?: string;
      } | null;

      return {
        id: c._id.toString(),
        name: c.name,
        companyCode: c.companyCode,
        businessType: c.businessType || "",
        approvalWorkflow: c.approvalWorkflow,
        subscription: c.subscription,
        isActive: c.isActive,
        branchCount: branchMap.get(c._id.toString()) || 0,
        userCount: userMap.get(c._id.toString()) || 0,
        superAdmin: owner
          ? {
              name: owner.name || "",
              email: owner.email || "",
              employeeCode: owner.employeeCode || "",
            }
          : null,
        createdAt: c.createdAt,
      };
    });

    return NextResponse.json({ companies: items });
  } catch (error) {
    console.error("[GET /api/platform/companies] Error:", error);
    return NextResponse.json(
      { error: "Failed to load client organizations." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await getPlatformAdminContext();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const parsed = provisionCompanySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    await dbConnect();
    const data = parsed.data;
    const normalizedCode = data.companyCode.toUpperCase();
    const normalizedEmail = data.adminEmail.toLowerCase();

    const [codeExists, emailExists] = await Promise.all([
      Company.exists({ companyCode: normalizedCode }),
      User.exists({ email: normalizedEmail }),
    ]);

    if (codeExists) {
      return NextResponse.json(
        { error: `Company Code "${normalizedCode}" is already in use.` },
        { status: 409 }
      );
    }

    if (emailExists) {
      return NextResponse.json(
        { error: `Admin email "${normalizedEmail}" is already registered.` },
        { status: 409 }
      );
    }

    const company = await Company.create({
      name: data.name,
      companyCode: normalizedCode,
      slug: generateCompanySlug(data.name),
      businessType: data.businessType || "Enterprise",
      phone: data.phone,
      address: data.address,
      approvalWorkflow: data.approvalWorkflow,
      subscription: {
        plan: data.plan,
        status: data.subscriptionStatus,
      },
      wallets: [
        { name: "Cash in Hand", type: "CASH", openingBalance: 0, isDefault: true, isActive: true },
        { name: "bKash", type: "BKASH", openingBalance: 0, isDefault: false, isActive: true },
        { name: "Nagad", type: "NAGAD", openingBalance: 0, isDefault: false, isActive: true },
        { name: "Bank Account", type: "BANK", openingBalance: 0, isDefault: false, isActive: true },
      ],
    });

    try {
      const hqBranch = await Branch.create({
        companyId: company._id,
        name: data.hqBranchName,
        code: "HQ-01",
        address: data.address,
        isActive: true,
      });

      const passwordHash = await bcrypt.hash(data.adminPassword, 12);
      const adminUser = await User.create({
        name: data.adminName,
        email: normalizedEmail,
        employeeCode: (
          data.adminEmployeeCode || `${normalizedCode.slice(0, 4)}-MD-01`
        ).toUpperCase(),
        passwordHash,
        authProvider: "credentials",
        isPlatformAdmin: false,
        companyId: company._id,
        branchId: hqBranch._id,
        role: "COMPANY_SUPER_ADMIN",
        isActive: true,
      });

      company.ownerId = adminUser._id;
      await company.save();

      hqBranch.managerId = adminUser._id;
      await hqBranch.save();

      await recordAuditLog({
        companyId: company._id,
        actorId: auth.admin.userId,
        action: "CREATE",
        entityType: "COMPANY",
        entityId: company._id,
        summary: `Platform Admin provisioned "${company.name}" (${normalizedCode}) with MD ${adminUser.name}`,
      });

      return NextResponse.json(
        {
          message: `Organization "${company.name}" (${normalizedCode}) provisioned successfully.`,
          company: {
            id: company._id.toString(),
            name: company.name,
            companyCode: company.companyCode,
            approvalWorkflow: company.approvalWorkflow,
          },
          superAdmin: {
            email: adminUser.email,
            employeeCode: adminUser.employeeCode,
          },
        },
        { status: 201 }
      );
    } catch (innerError) {
      await Promise.all([
        Branch.deleteMany({ companyId: company._id }).catch(() => {}),
        User.deleteMany({ companyId: company._id }).catch(() => {}),
        Company.deleteOne({ _id: company._id }).catch(() => {}),
      ]);
      throw innerError;
    }
  } catch (error) {
    console.error("[POST /api/platform/companies] Error:", error);
    return NextResponse.json(
      { error: "Failed to provision client organization." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await getPlatformAdminContext();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const parsed = updateCompanyStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid update payload" },
        { status: 400 }
      );
    }

    await dbConnect();
    const company = await Company.findById(parsed.data.companyId);
    if (!company) {
      return NextResponse.json(
        { error: "Organization not found." },
        { status: 404 }
      );
    }

    if (parsed.data.subscriptionStatus) {
      company.subscription.status = parsed.data.subscriptionStatus;
    }
    if (parsed.data.plan) {
      company.subscription.plan = parsed.data.plan;
    }
    if (parsed.data.approvalWorkflow) {
      company.approvalWorkflow = parsed.data.approvalWorkflow;
    }
    if (parsed.data.isActive !== undefined) {
      company.isActive = parsed.data.isActive;
    }

    await company.save();

    await recordAuditLog({
      companyId: company._id,
      actorId: auth.admin.userId,
      action: "UPDATE",
      entityType: "COMPANY",
      entityId: company._id,
      summary: `Platform Admin updated governance/subscription settings for "${company.name}"`,
    });

    return NextResponse.json({ message: "Organization updated." });
  } catch (error) {
    console.error("[PATCH /api/platform/companies] Error:", error);
    return NextResponse.json(
      { error: "Failed to update organization." },
      { status: 500 }
    );
  }
}
