import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import dbConnect from "@/lib/dbConnect";
import {
  getNextApprovalStatus,
  getTenantAuthContext,
} from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { Transaction } from "@/models";
import { formatBDT } from "@/lib/utils";

const decisionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(400).optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  if (auth.ctx.role === "EMPLOYEE") {
    return NextResponse.json(
      { error: "Employees cannot approve or reject transactions." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid transaction ID" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const parsed = decisionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid decision payload" },
        { status: 400 }
      );
    }

    const { action, note } = parsed.data;
    if (action === "REJECT" && (!note || note.length < 3)) {
      return NextResponse.json(
        { error: "A rejection reason note (at least 3 characters) is required." },
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

    if (
      transaction.approvalStatus === "FINAL_APPROVED" ||
      transaction.approvalStatus === "REJECTED"
    ) {
      return NextResponse.json(
        { error: "This transaction has already been finalized." },
        { status: 400 }
      );
    }

    // Branch isolation for Branch Managers
    if (auth.ctx.role === "BRANCH_MANAGER") {
      if (
        !auth.ctx.branchId ||
        transaction.branchId?.toString() !== auth.ctx.branchId
      ) {
        return NextResponse.json(
          { error: "Forbidden: You can only review entries from your assigned branch." },
          { status: 403 }
        );
      }
      if (transaction.approvalStatus !== "PENDING_MANAGER") {
        return NextResponse.json(
          { error: "This entry is no longer waiting for Branch Manager approval." },
          { status: 400 }
        );
      }
    }

    // Tier enforcement for HQ Admin Officer
    if (
      auth.ctx.role === "HQ_ADMIN_OFFICER" &&
      transaction.approvalStatus !== "PENDING_HQ"
    ) {
      return NextResponse.json(
        { error: "This entry is not currently at the HQ Audit tier." },
        { status: 400 }
      );
    }

    if (action === "APPROVE") {
      const nextStatus = getNextApprovalStatus(
        transaction.approvalStatus,
        auth.ctx.role,
        auth.ctx.approvalWorkflow
      );

      if (!nextStatus) {
        return NextResponse.json(
          { error: "You are not authorized to approve this entry at its current tier." },
          { status: 403 }
        );
      }

      transaction.approvalStatus = nextStatus;
      transaction.approvalHistory.push({
        actorId: new Types.ObjectId(auth.ctx.userId),
        actorName: auth.ctx.userName,
        role: auth.ctx.role,
        action: "APPROVED",
        note: note || undefined,
        timestamp: new Date(),
      });
      transaction.updatedBy = new Types.ObjectId(auth.ctx.userId);
      await transaction.save();

      await recordAuditLog({
        companyId: auth.ctx.companyId,
        actorId: auth.ctx.userId,
        action: "APPROVE",
        entityType: "TRANSACTION",
        entityId: transaction._id,
        summary: `${auth.ctx.userName} (${auth.ctx.role}) approved ${transaction.type} of ${formatBDT(transaction.amount)} → ${nextStatus}`,
        metadata: { nextStatus, note },
      });

      return NextResponse.json({
        message:
          nextStatus === "FINAL_APPROVED"
            ? "Transaction final-approved and posted to live P&L."
            : "Transaction approved and forwarded to the next tier.",
        approvalStatus: nextStatus,
      });
    } else {
      transaction.approvalStatus = "REJECTED";
      transaction.rejectionReason = note;
      transaction.approvalHistory.push({
        actorId: new Types.ObjectId(auth.ctx.userId),
        actorName: auth.ctx.userName,
        role: auth.ctx.role,
        action: "REJECTED",
        note,
        timestamp: new Date(),
      });
      transaction.updatedBy = new Types.ObjectId(auth.ctx.userId);
      await transaction.save();

      await recordAuditLog({
        companyId: auth.ctx.companyId,
        actorId: auth.ctx.userId,
        action: "REJECT",
        entityType: "TRANSACTION",
        entityId: transaction._id,
        summary: `${auth.ctx.userName} (${auth.ctx.role}) rejected ${transaction.type} of ${formatBDT(transaction.amount)}: ${note}`,
        metadata: { reason: note },
      });

      return NextResponse.json({
        message: "Transaction rejected with reason recorded.",
        approvalStatus: "REJECTED",
      });
    }
  } catch (error) {
    console.error("[POST /api/transactions/[id]/approve] Error:", error);
    return NextResponse.json(
      { error: "Failed to process approval decision." },
      { status: 500 }
    );
  }
}
