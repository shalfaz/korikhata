import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import dbConnect from "@/lib/dbConnect";
import { getTenantAuthContext } from "@/lib/auth";
import {
  APPROVAL_WORKFLOWS,
  Company,
  WALLET_TYPES,
} from "@/models";
import { recordAuditLog } from "@/lib/audit";

const updateCompanySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("UPDATE_PROFILE"),
    name: z.string().trim().min(2).max(120),
    businessType: z.string().trim().max(80).optional(),
    phone: z.string().trim().max(30).optional(),
    email: z.string().trim().email().or(z.literal("")).optional(),
    address: z.string().trim().max(300).optional(),
    approvalWorkflow: z.enum(APPROVAL_WORKFLOWS).optional(),
  }),
  z.object({
    action: z.literal("ADD_WALLET"),
    wallet: z.object({
      name: z.string().trim().min(2).max(60),
      type: z.enum(WALLET_TYPES),
      accountNumber: z.string().trim().max(60).optional(),
      openingBalance: z.number().default(0),
    }),
  }),
  z.object({
    action: z.literal("REMOVE_WALLET"),
    walletId: z.string().min(1),
  }),
]);

export async function GET() {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  try {
    await dbConnect();

    const company = await Company.findById(auth.ctx.companyId).lean();
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json({
      company: {
        id: company._id.toString(),
        name: company.name,
        companyCode: company.companyCode,
        slug: company.slug,
        businessType: company.businessType || "",
        phone: company.phone || "",
        email: company.email || "",
        address: company.address || "",
        currency: company.currency,
        currencySymbol: company.currencySymbol,
        approvalWorkflow: company.approvalWorkflow,
        subscription: company.subscription,
        wallets: company.wallets
          .filter((w) => w.isActive)
          .map((w) => ({
            id: w._id?.toString() || "",
            name: w.name,
            type: w.type,
            accountNumber: w.accountNumber || "",
            openingBalance: w.openingBalance,
            isDefault: w.isDefault,
          })),
      },
      role: auth.ctx.role,
    });
  } catch (error) {
    console.error("[GET /api/companies] Error:", error);
    return NextResponse.json(
      { error: "Failed to load company settings." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  if (auth.ctx.role !== "COMPANY_SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Only the Company Super Admin (MD) can modify organization settings." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const parsed = updateCompanySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid update payload" },
        { status: 400 }
      );
    }

    await dbConnect();
    const company = await Company.findById(auth.ctx.companyId);
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const data = parsed.data;

    if (data.action === "UPDATE_PROFILE") {
      company.name = data.name;
      company.businessType = data.businessType;
      company.phone = data.phone;
      company.email = data.email || undefined;
      company.address = data.address;
      if (data.approvalWorkflow) {
        company.approvalWorkflow = data.approvalWorkflow;
      }
      await company.save();

      await recordAuditLog({
        companyId: company._id,
        actorId: auth.ctx.userId,
        action: "UPDATE",
        entityType: "COMPANY",
        entityId: company._id,
        summary: `Updated organization profile & governance settings for "${company.name}"`,
      });

      return NextResponse.json({ message: "Organization profile updated." });
    }

    if (data.action === "ADD_WALLET") {
      company.wallets.push({
        name: data.wallet.name,
        type: data.wallet.type,
        accountNumber: data.wallet.accountNumber,
        openingBalance: data.wallet.openingBalance,
        isDefault: false,
        isActive: true,
      });
      await company.save();

      await recordAuditLog({
        companyId: company._id,
        actorId: auth.ctx.userId,
        action: "CREATE",
        entityType: "WALLET",
        summary: `Added wallet "${data.wallet.name}" (${data.wallet.type})`,
      });

      return NextResponse.json({ message: "Wallet added successfully." });
    }

    if (data.action === "REMOVE_WALLET") {
      const target = company.wallets.find(
        (w) => w._id?.toString() === data.walletId && w.isActive
      );
      if (!target) {
        return NextResponse.json({ error: "Wallet not found." }, { status: 404 });
      }
      const activeCount = company.wallets.filter((w) => w.isActive).length;
      if (activeCount <= 1) {
        return NextResponse.json(
          { error: "At least one active wallet is required." },
          { status: 400 }
        );
      }

      target.isActive = false;
      await company.save();

      await recordAuditLog({
        companyId: company._id,
        actorId: auth.ctx.userId,
        action: "SOFT_DELETE",
        entityType: "WALLET",
        summary: `Removed wallet "${target.name}"`,
      });

      return NextResponse.json({ message: "Wallet removed." });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    console.error("[PATCH /api/companies] Error:", error);
    return NextResponse.json(
      { error: "Failed to update organization settings." },
      { status: 500 }
    );
  }
}
