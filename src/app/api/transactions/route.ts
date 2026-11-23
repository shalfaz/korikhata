import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import dbConnect from "@/lib/dbConnect";
import {
  getInitialApprovalStatus,
  getTenantAuthContext,
  isHQOrSuperAdmin,
} from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import {
  APPROVAL_STATUSES,
  Branch,
  Company,
  Transaction,
  TRANSACTION_TYPES,
  WALLET_TYPES,
} from "@/models";
import { formatBDT } from "@/lib/utils";

const RECEIPT_REQUIRED_EXPENSE_THRESHOLD = 2000;

const createTransactionSchema = z.object({
  type: z.enum(TRANSACTION_TYPES),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  category: z.string().trim().max(80).optional(),
  walletId: z.string().optional(),
  walletName: z.string().trim().min(1, "Source wallet is required").max(60),
  walletType: z.enum(WALLET_TYPES),
  destinationWalletId: z.string().optional(),
  destinationWalletName: z.string().trim().max(60).optional(),
  destinationWalletType: z.enum(WALLET_TYPES).optional(),
  branchId: z.string().optional(),
  referenceNo: z.string().trim().max(80).optional(),
  date: z.string().optional(),
  note: z.string().trim().max(500).optional(),
  contactId: z.string().optional(),
  receipt: z
    .object({
      url: z.string().url(),
      publicId: z.string().min(1),
      format: z.string().optional(),
      bytes: z.number().optional(),
    })
    .optional(),
});

export async function GET(req: NextRequest) {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    const wallet = searchParams.get("wallet");
    const category = searchParams.get("category");
    const approvalStatus = searchParams.get("approvalStatus");
    const branchIdParam = searchParams.get("branchId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const search = searchParams.get("search")?.trim();
    const limit = Math.min(Number(searchParams.get("limit") || 100), 500);
    const page = Math.max(Number(searchParams.get("page") || 1), 1);

    const filter: Record<string, unknown> = {
      companyId: new Types.ObjectId(auth.ctx.companyId),
      isDeleted: false,
    };

    if (auth.ctx.role === "EMPLOYEE") {
      filter.createdBy = new Types.ObjectId(auth.ctx.userId);
    } else if (auth.ctx.role === "BRANCH_MANAGER") {
      if (auth.ctx.branchId) {
        filter.branchId = new Types.ObjectId(auth.ctx.branchId);
      } else {
        filter.createdBy = new Types.ObjectId(auth.ctx.userId);
      }
    } else if (
      isHQOrSuperAdmin(auth.ctx.role) &&
      branchIdParam &&
      branchIdParam !== "ALL" &&
      Types.ObjectId.isValid(branchIdParam)
    ) {
      filter.branchId = new Types.ObjectId(branchIdParam);
    }

    if (type === "INCOME" || type === "EXPENSE" || type === "TRANSFER") {
      filter.type = type;
    }

    if (wallet && wallet !== "ALL") {
      filter["wallet.type"] = wallet;
    }

    if (category && category !== "ALL") {
      filter.category = category;
    }

    if (approvalStatus && approvalStatus !== "ALL") {
      if (approvalStatus === "PENDING") {
        filter.approvalStatus = {
          $in: ["PENDING_MANAGER", "PENDING_HQ", "PENDING_FINAL"],
        };
      } else if (
        (APPROVAL_STATUSES as readonly string[]).includes(approvalStatus)
      ) {
        filter.approvalStatus = approvalStatus;
      }
    }

    if (startDate || endDate) {
      const dateQuery: Record<string, Date> = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (!Number.isNaN(start.getTime())) dateQuery.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (!Number.isNaN(end.getTime())) dateQuery.$lte = end;
      }
      if (Object.keys(dateQuery).length > 0) {
        filter.date = dateQuery;
      }
    }

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { voucherNo: { $regex: escaped, $options: "i" } },
        { referenceNo: { $regex: escaped, $options: "i" } },
        { note: { $regex: escaped, $options: "i" } },
        { category: { $regex: escaped, $options: "i" } },
        { "wallet.name": { $regex: escaped, $options: "i" } },
      ];
    }

    const [transactions, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("createdBy", "name email employeeCode")
        .populate("branchId", "name code")
        .populate("contactId", "name phone")
        .lean(),
      Transaction.countDocuments(filter),
    ]);

    const items = transactions.map((t) => {
      const creator = t.createdBy as unknown as {
        name?: string;
        employeeCode?: string;
      } | null;
      const branch = t.branchId as unknown as {
        _id?: { toString(): string };
        name?: string;
        code?: string;
      } | null;
      const contact = t.contactId as unknown as {
        _id?: { toString(): string };
        name?: string;
        phone?: string;
      } | null;

      return {
        id: t._id.toString(),
        voucherNo: t.voucherNo || "",
        referenceNo: t.referenceNo || "",
        type: t.type,
        amount: t.amount,
        category: t.category,
        wallet: {
          walletId: t.wallet.walletId?.toString() || null,
          name: t.wallet.name,
          type: t.wallet.type,
        },
        destinationWallet: t.destinationWallet
          ? {
              walletId: t.destinationWallet.walletId?.toString() || null,
              name: t.destinationWallet.name,
              type: t.destinationWallet.type,
            }
          : null,
        date: t.date,
        note: t.note || "",
        receipt: t.receipt || null,
        approvalStatus: t.approvalStatus,
        rejectionReason: t.rejectionReason || "",
        branch: branch
          ? {
              id: branch._id?.toString() || "",
              name: branch.name || "",
              code: branch.code || "",
            }
          : null,
        contact: contact
          ? {
              id: contact._id?.toString() || "",
              name: contact.name || "",
              phone: contact.phone || "",
            }
          : null,
        createdByName: creator?.name || "Staff",
        createdByCode: creator?.employeeCode || "",
        createdAt: t.createdAt,
      };
    });

    return NextResponse.json({
      transactions: items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error("[GET /api/transactions] Error:", error);
    return NextResponse.json(
      { error: "Failed to load transactions." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const parsed = createTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message || "Invalid transaction data",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Smart Receipt Policy: Expenses over ৳ 2,000 require a receipt/cash memo
    if (
      data.type === "EXPENSE" &&
      data.amount > RECEIPT_REQUIRED_EXPENSE_THRESHOLD &&
      !data.receipt?.url
    ) {
      return NextResponse.json(
        {
          error: `Receipt / cash memo upload is required for expenses above ${formatBDT(RECEIPT_REQUIRED_EXPENSE_THRESHOLD)}.`,
        },
        { status: 400 }
      );
    }

    // Transfer validation
    if (data.type === "TRANSFER") {
      if (!data.destinationWalletName || !data.destinationWalletType) {
        return NextResponse.json(
          { error: "Please select a destination wallet for the transfer." },
          { status: 400 }
        );
      }
      if (
        data.walletType === data.destinationWalletType &&
        data.walletName.trim().toLowerCase() ===
          data.destinationWalletName.trim().toLowerCase()
      ) {
        return NextResponse.json(
          { error: "Source and destination wallets must be different." },
          { status: 400 }
        );
      }
    }

    await dbConnect();

    const txDate = data.date ? new Date(data.date) : new Date();
    if (Number.isNaN(txDate.getTime())) {
      return NextResponse.json({ error: "Invalid date value" }, { status: 400 });
    }

    // Strict Branch / Cost Center enforcement
    let effectiveBranchId = auth.ctx.branchId;
    if (
      isHQOrSuperAdmin(auth.ctx.role) &&
      data.branchId &&
      Types.ObjectId.isValid(data.branchId)
    ) {
      const validBranch = await Branch.exists({
        _id: data.branchId,
        companyId: auth.ctx.companyId,
        isActive: true,
      });
      if (validBranch) {
        effectiveBranchId = data.branchId;
      }
    }

    // Atomically increment company voucher sequence -> VCH-SHL-0001
    const updatedCompany = await Company.findOneAndUpdate(
      { _id: auth.ctx.companyId },
      { $inc: { voucherSequence: 1 } },
      { new: true }
    ).lean();

    if (!updatedCompany) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const codePrefix = (
      updatedCompany.companyCode.replace(/[^A-Z0-9]/g, "").slice(0, 3) || "VCH"
    ).toUpperCase();
    const seq = updatedCompany.voucherSequence || 1;
    const voucherNo = `VCH-${codePrefix}-${String(seq).padStart(4, "0")}`;

    const matchedWallet = updatedCompany.wallets.find(
      (w) =>
        w.isActive &&
        ((data.walletId && w._id?.toString() === data.walletId) ||
          (w.type === data.walletType && w.name === data.walletName))
    );

    const matchedDestWallet =
      data.type === "TRANSFER"
        ? updatedCompany.wallets.find(
            (w) =>
              w.isActive &&
              ((data.destinationWalletId &&
                w._id?.toString() === data.destinationWalletId) ||
                (w.type === data.destinationWalletType &&
                  w.name === data.destinationWalletName))
          )
        : undefined;

    const initialStatus = getInitialApprovalStatus(
      auth.ctx.role,
      auth.ctx.approvalWorkflow
    );

    const history = [
      {
        actorId: new Types.ObjectId(auth.ctx.userId),
        actorName: auth.ctx.userName,
        role: auth.ctx.role,
        action: "SUBMITTED" as const,
        note: data.note,
        timestamp: new Date(),
      },
      ...(initialStatus === "FINAL_APPROVED"
        ? [
            {
              actorId: new Types.ObjectId(auth.ctx.userId),
              actorName: auth.ctx.userName,
              role: auth.ctx.role,
              action: "APPROVED" as const,
              note: "Auto-approved by Company Super Admin",
              timestamp: new Date(),
            },
          ]
        : []),
    ];

    const category =
      data.type === "TRANSFER"
        ? "Internal Transfer"
        : data.category?.trim() || "General";

    const transaction = await Transaction.create({
      companyId: auth.ctx.companyId,
      branchId: effectiveBranchId || undefined,
      voucherNo,
      referenceNo: data.referenceNo || undefined,
      type: data.type,
      amount: data.amount,
      category,
      wallet: {
        walletId: matchedWallet?._id,
        name: matchedWallet?.name || data.walletName,
        type: matchedWallet?.type || data.walletType,
      },
      destinationWallet:
        data.type === "TRANSFER" &&
        data.destinationWalletName &&
        data.destinationWalletType
          ? {
              walletId: matchedDestWallet?._id,
              name: matchedDestWallet?.name || data.destinationWalletName,
              type: matchedDestWallet?.type || data.destinationWalletType,
            }
          : undefined,
      date: txDate,
      note: data.note,
      contactId:
        data.type !== "TRANSFER" &&
        data.contactId &&
        Types.ObjectId.isValid(data.contactId)
          ? data.contactId
          : undefined,
      receipt: data.receipt,
      approvalStatus: initialStatus,
      approvalHistory: history,
      createdBy: auth.ctx.userId,
    });

    await recordAuditLog({
      companyId: auth.ctx.companyId,
      actorId: auth.ctx.userId,
      action: "CREATE",
      entityType: "TRANSACTION",
      entityId: transaction._id,
      summary:
        data.type === "TRANSFER"
          ? `Created ${voucherNo}: Transfer ${formatBDT(data.amount)} (${transaction.wallet.name} → ${transaction.destinationWallet?.name}) [${initialStatus}]`
          : `Created ${voucherNo}: ${data.type} ${formatBDT(data.amount)} (${category}) [${initialStatus}]`,
      metadata: {
        voucherNo,
        type: data.type,
        amount: data.amount,
        category,
        approvalStatus: initialStatus,
      },
    });

    return NextResponse.json(
      {
        message:
          initialStatus === "FINAL_APPROVED"
            ? `Voucher ${voucherNo} posted and approved.`
            : `Voucher ${voucherNo} submitted for approval.`,
        voucherNo,
        transaction: {
          id: transaction._id.toString(),
          voucherNo,
          referenceNo: transaction.referenceNo || "",
          type: transaction.type,
          amount: transaction.amount,
          category: transaction.category,
          wallet: transaction.wallet,
          destinationWallet: transaction.destinationWallet || null,
          approvalStatus: transaction.approvalStatus,
          date: transaction.date,
          note: transaction.note || "",
          receipt: transaction.receipt || null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/transactions] Error:", error);
    return NextResponse.json(
      { error: "Failed to save voucher." },
      { status: 500 }
    );
  }
}
