import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import { getQueueStatusForRole, getTenantAuthContext } from "@/lib/auth";
import { Transaction } from "@/models";

export async function GET(req: NextRequest) {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  const queueStatus = getQueueStatusForRole(auth.ctx.role);
  if (!queueStatus) {
    return NextResponse.json({
      items: [],
      pendingCount: 0,
      role: auth.ctx.role,
    });
  }

  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope") || "mine"; // "mine" | "all_pending" (for Super Admin)

    const filter: Record<string, unknown> = {
      companyId: new Types.ObjectId(auth.ctx.companyId),
      isDeleted: false,
    };

    if (
      auth.ctx.role === "BRANCH_MANAGER" ||
      auth.ctx.role === "BRANCH_ADMIN"
    ) {
      if (!auth.ctx.branchId) {
        return NextResponse.json({ items: [], pendingCount: 0 });
      }
      filter.branchId = new Types.ObjectId(auth.ctx.branchId);
      filter.approvalStatus = "PENDING_MANAGER";
    } else if (auth.ctx.role === "HQ_ADMIN") {
      filter.approvalStatus = { $in: ["PENDING_HQ", "PENDING_FINAL"] };
    } else if (auth.ctx.role === "COMPANY_SUPER_ADMIN") {
      filter.approvalStatus =
        scope === "all_pending"
          ? { $in: ["PENDING_FINAL", "PENDING_HQ", "PENDING_MANAGER"] }
          : "PENDING_FINAL";
    }

    const myTierCountFilter: Record<string, unknown> = {
      companyId: new Types.ObjectId(auth.ctx.companyId),
      isDeleted: false,
      approvalStatus:
        auth.ctx.role === "HQ_ADMIN"
          ? { $in: ["PENDING_HQ", "PENDING_FINAL"] }
          : queueStatus,
      ...((auth.ctx.role === "BRANCH_MANAGER" ||
        auth.ctx.role === "BRANCH_ADMIN") &&
      auth.ctx.branchId
        ? { branchId: new Types.ObjectId(auth.ctx.branchId) }
        : {}),
    };

    const [rows, pendingCount] = await Promise.all([
      Transaction.find(filter)
        .sort({ createdAt: -1 })
        .limit(100)
        .populate("createdBy", "name email employeeCode")
        .populate("branchId", "name code")
        .lean(),
      Transaction.countDocuments(myTierCountFilter),
    ]);

    const items = rows.map((t) => {
      const creator = t.createdBy as unknown as {
        name?: string;
        email?: string;
        employeeCode?: string;
      } | null;
      const branch = t.branchId as unknown as {
        _id?: { toString(): string };
        name?: string;
        code?: string;
      } | null;

      return {
        id: t._id.toString(),
        type: t.type,
        amount: t.amount,
        category: t.category,
        wallet: t.wallet,
        date: t.date,
        note: t.note || "",
        receipt: t.receipt || null,
        approvalStatus: t.approvalStatus,
        approvalHistory: (t.approvalHistory || []).map((h) => ({
          actorName: h.actorName,
          role: h.role,
          action: h.action,
          note: h.note || "",
          timestamp: h.timestamp,
        })),
        branch: branch
          ? {
              id: branch._id?.toString() || "",
              name: branch.name || "",
              code: branch.code || "",
            }
          : null,
        submittedBy: {
          name: creator?.name || "Staff",
          employeeCode: creator?.employeeCode || "",
          email: creator?.email || "",
        },
        createdAt: t.createdAt,
      };
    });

    return NextResponse.json({
      items,
      pendingCount,
      queueStatus,
      role: auth.ctx.role,
      approvalWorkflow: auth.ctx.approvalWorkflow,
    });
  } catch (error) {
    console.error("[GET /api/approvals] Error:", error);
    return NextResponse.json(
      { error: "Failed to load approval queue." },
      { status: 500 }
    );
  }
}
