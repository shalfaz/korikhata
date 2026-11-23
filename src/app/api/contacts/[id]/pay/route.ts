import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import dbConnect from "@/lib/dbConnect";
import {
  canManageDues,
  getInitialApprovalStatus,
  getTenantAuthContext,
} from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import {
  Contact,
  DUE_DIRECTIONS,
  DUE_ENTRY_TYPES,
  Transaction,
  WALLET_TYPES,
} from "@/models";
import { formatBDT } from "@/lib/utils";

const duePaymentSchema = z.object({
  entryType: z.enum(DUE_ENTRY_TYPES),
  direction: z.enum(DUE_DIRECTIONS),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  walletName: z.string().trim().min(1).max(60).default("Cash in Hand"),
  walletType: z.enum(WALLET_TYPES).default("CASH"),
  date: z.string().optional(),
  note: z.string().trim().max(300).optional(),
  nextDueDate: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  if (!canManageDues(auth.ctx.role)) {
    return NextResponse.json(
      { error: "You do not have permission to record due payments." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid contact ID" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const parsed = duePaymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid payment payload" },
        { status: 400 }
      );
    }

    await dbConnect();

    const contact = await Contact.findOne({
      _id: id,
      companyId: auth.ctx.companyId,
      isActive: true,
    });

    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found in this organization." },
        { status: 404 }
      );
    }

    const data = parsed.data;
    const entryDate = data.date ? new Date(data.date) : new Date();
    let linkedTransactionId: Types.ObjectId | undefined;

    const initialStatus = getInitialApprovalStatus(
      auth.ctx.role,
      auth.ctx.approvalWorkflow
    );

    const baseHistory = [
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

    if (data.entryType === "DUE_ADDED") {
      if (data.direction === "RECEIVABLE") {
        contact.receivableBalance += data.amount;
      } else {
        contact.payableBalance += data.amount;
      }
    } else if (data.entryType === "PAYMENT_RECEIVED") {
      if (data.amount > contact.receivableBalance) {
        return NextResponse.json(
          {
            error: `Payment (${formatBDT(data.amount)}) exceeds receivable due (${formatBDT(contact.receivableBalance)}).`,
          },
          { status: 400 }
        );
      }
      contact.receivableBalance = Math.max(
        0,
        contact.receivableBalance - data.amount
      );

      const tx = await Transaction.create({
        companyId: auth.ctx.companyId,
        branchId: auth.ctx.branchId || undefined,
        type: "INCOME",
        amount: data.amount,
        category: "Due Collection",
        wallet: {
          name: data.walletName,
          type: data.walletType,
        },
        date: entryDate,
        note: data.note || `Due collection from ${contact.name}`,
        contactId: contact._id,
        approvalStatus: initialStatus,
        approvalHistory: baseHistory,
        createdBy: auth.ctx.userId,
      });
      linkedTransactionId = tx._id;
    } else if (data.entryType === "PAYMENT_MADE") {
      if (data.amount > contact.payableBalance) {
        return NextResponse.json(
          {
            error: `Payment (${formatBDT(data.amount)}) exceeds payable due (${formatBDT(contact.payableBalance)}).`,
          },
          { status: 400 }
        );
      }
      contact.payableBalance = Math.max(0, contact.payableBalance - data.amount);

      const tx = await Transaction.create({
        companyId: auth.ctx.companyId,
        branchId: auth.ctx.branchId || undefined,
        type: "EXPENSE",
        amount: data.amount,
        category: "Supplier Payment",
        wallet: {
          name: data.walletName,
          type: data.walletType,
        },
        date: entryDate,
        note: data.note || `Due payment to ${contact.name}`,
        contactId: contact._id,
        approvalStatus: initialStatus,
        approvalHistory: baseHistory,
        createdBy: auth.ctx.userId,
      });
      linkedTransactionId = tx._id;
    }

    contact.dueHistory.push({
      entryType: data.entryType,
      direction: data.direction,
      amount: data.amount,
      date: entryDate,
      note: data.note,
      transactionId: linkedTransactionId,
      recordedBy: new Types.ObjectId(auth.ctx.userId),
    });

    if (data.nextDueDate) {
      contact.nextDueDate = new Date(data.nextDueDate);
    }
    contact.lastActivityAt = new Date();
    contact.updatedBy = new Types.ObjectId(auth.ctx.userId);
    await contact.save();

    const actionLabel =
      data.entryType === "PAYMENT_RECEIVED"
        ? `Received ${formatBDT(data.amount)} due payment from ${contact.name}`
        : data.entryType === "PAYMENT_MADE"
        ? `Paid ${formatBDT(data.amount)} due to ${contact.name}`
        : `Added ${formatBDT(data.amount)} ${data.direction.toLowerCase()} due for ${contact.name}`;

    await recordAuditLog({
      companyId: auth.ctx.companyId,
      actorId: auth.ctx.userId,
      action: "UPDATE",
      entityType: "CONTACT",
      entityId: contact._id,
      summary: actionLabel,
    });

    return NextResponse.json({
      message: "Due updated successfully.",
      contact: {
        id: contact._id.toString(),
        receivableBalance: contact.receivableBalance,
        payableBalance: contact.payableBalance,
      },
    });
  } catch (error) {
    console.error("[POST /api/contacts/[id]/pay] Error:", error);
    return NextResponse.json(
      { error: "Failed to record due update." },
      { status: 500 }
    );
  }
}
