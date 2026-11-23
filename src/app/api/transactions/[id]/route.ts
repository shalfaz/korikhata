import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import dbConnect from "@/lib/dbConnect";
import {
  canDeleteTransactions,
  getTenantAuthContext,
  isHQOrSuperAdmin,
} from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { Transaction, TRANSACTION_TYPES, WALLET_TYPES } from "@/models";
import { formatBDT } from "@/lib/utils";

const updateTransactionSchema = z.object({
  type: z.enum(TRANSACTION_TYPES).optional(),
  amount: z.coerce.number().positive("Amount must be greater than 0").optional(),
  category: z.string().trim().min(1).max(80).optional(),
  walletName: z.string().trim().min(1).max(60).optional(),
  walletType: z.enum(WALLET_TYPES).optional(),
  date: z.string().optional(),
  note: z.string().trim().max(500).optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  if (!isHQOrSuperAdmin(auth.ctx.role)) {
    return NextResponse.json(
      { error: "Only Company Super Admins and HQ Officers can edit entries." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid transaction ID" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const parsed = updateTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid update payload" },
        { status: 400 }
      );
    }

    await dbConnect();

    const transaction = await Transaction.findOne({
      _id: id,
      companyId: auth.ctx.companyId,
      isDeleted: false,
    });

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaction not found in this organization." },
        { status: 404 }
      );
    }

    const previousAmount = transaction.amount;
    const data = parsed.data;

    if (data.type) transaction.type = data.type;
    if (data.amount !== undefined) transaction.amount = data.amount;
    if (data.category) transaction.category = data.category;
    if (data.walletName) transaction.wallet.name = data.walletName;
    if (data.walletType) transaction.wallet.type = data.walletType;
    if (data.note !== undefined) transaction.note = data.note;
    if (data.date) {
      const parsedDate = new Date(data.date);
      if (!Number.isNaN(parsedDate.getTime())) {
        transaction.date = parsedDate;
      }
    }

    transaction.updatedBy = new Types.ObjectId(auth.ctx.userId);
    await transaction.save();

    await recordAuditLog({
      companyId: auth.ctx.companyId,
      actorId: auth.ctx.userId,
      action: "UPDATE",
      entityType: "TRANSACTION",
      entityId: transaction._id,
      summary: `Updated ${transaction.type} (${transaction.category}) from ${formatBDT(previousAmount)} to ${formatBDT(transaction.amount)}`,
    });

    return NextResponse.json({ message: "Transaction updated successfully." });
  } catch (error) {
    console.error("[PATCH /api/transactions/[id]] Error:", error);
    return NextResponse.json(
      { error: "Failed to update transaction." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  if (!canDeleteTransactions(auth.ctx.role)) {
    return NextResponse.json(
      { error: "Only the Company Super Admin (MD) can delete historical entries." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid transaction ID" }, { status: 400 });
  }

  try {
    await dbConnect();

    const transaction = await Transaction.findOne({
      _id: id,
      companyId: auth.ctx.companyId,
      isDeleted: false,
    });

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaction not found in this organization." },
        { status: 404 }
      );
    }

    transaction.isDeleted = true;
    transaction.updatedBy = new Types.ObjectId(auth.ctx.userId);
    await transaction.save();

    await recordAuditLog({
      companyId: auth.ctx.companyId,
      actorId: auth.ctx.userId,
      action: "SOFT_DELETE",
      entityType: "TRANSACTION",
      entityId: transaction._id,
      summary: `Deleted ${transaction.type} of ${formatBDT(transaction.amount)} (${transaction.category})`,
    });

    return NextResponse.json({ message: "Transaction deleted." });
  } catch (error) {
    console.error("[DELETE /api/transactions/[id]] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete transaction." },
      { status: 500 }
    );
  }
}
