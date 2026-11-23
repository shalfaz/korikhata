import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import dbConnect from "@/lib/dbConnect";
import {
  getQueueStatusForRole,
  getTenantAuthContext,
  isHQOrSuperAdmin,
} from "@/lib/auth";
import { Branch, Company, Contact, Transaction } from "@/models";

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function toISODateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET(req: NextRequest) {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  try {
    await dbConnect();

    const companyObjectId = new Types.ObjectId(auth.ctx.companyId);
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    // -------------------------------------------------------------------------
    // EMPLOYEE VIEW: Strictly personal submissions only (NO company-wide P&L)
    // -------------------------------------------------------------------------
    if (auth.ctx.role === "EMPLOYEE") {
      const userId = new Types.ObjectId(auth.ctx.userId);
      const baseMine = {
        companyId: companyObjectId,
        createdBy: userId,
        isDeleted: false,
      };

      const [
        submittedTodayCount,
        pendingCount,
        approvedCount,
        rejectedCount,
        myRecent,
      ] = await Promise.all([
        Transaction.countDocuments({
          ...baseMine,
          createdAt: { $gte: todayStart, $lte: todayEnd },
        }),
        Transaction.countDocuments({
          ...baseMine,
          approvalStatus: {
            $in: ["PENDING_MANAGER", "PENDING_HQ", "PENDING_FINAL"],
          },
        }),
        Transaction.countDocuments({
          ...baseMine,
          approvalStatus: "FINAL_APPROVED",
        }),
        Transaction.countDocuments({
          ...baseMine,
          approvalStatus: "REJECTED",
        }),
        Transaction.find(baseMine)
          .sort({ createdAt: -1 })
          .limit(12)
          .lean(),
      ]);

      return NextResponse.json({
        role: auth.ctx.role,
        companyName: auth.ctx.companyName,
        branchName: auth.ctx.branchName,
        employeeSummary: {
          submittedTodayCount,
          pendingCount,
          approvedCount,
          rejectedCount,
        },
        recentTransactions: myRecent.map((t) => ({
          id: t._id.toString(),
          type: t.type,
          amount: t.amount,
          category: t.category,
          wallet: t.wallet,
          date: t.date,
          note: t.note || "",
          approvalStatus: t.approvalStatus,
          rejectionReason: t.rejectionReason || "",
          receipt: t.receipt || null,
          createdByName: auth.ctx.userName,
        })),
      });
    }

    // -------------------------------------------------------------------------
    // MANAGER / HQ / COMPANY SUPER ADMIN VIEW (FINAL_APPROVED ONLY FOR P&L)
    // -------------------------------------------------------------------------
    const { searchParams } = new URL(req.url);
    const daysParam = Number(searchParams.get("days") || 7);
    const trendDays = daysParam === 30 ? 30 : 7;
    const branchIdParam = searchParams.get("branchId");

    let scopedBranchId: Types.ObjectId | null = null;
    if (
      (auth.ctx.role === "BRANCH_MANAGER" ||
        auth.ctx.role === "BRANCH_ADMIN") &&
      auth.ctx.branchId
    ) {
      scopedBranchId = new Types.ObjectId(auth.ctx.branchId);
    } else if (
      isHQOrSuperAdmin(auth.ctx.role) &&
      branchIdParam &&
      branchIdParam !== "ALL" &&
      Types.ObjectId.isValid(branchIdParam)
    ) {
      scopedBranchId = new Types.ObjectId(branchIdParam);
    }

    const baseScope: Record<string, unknown> = {
      companyId: companyObjectId,
      isDeleted: false,
      ...(scopedBranchId ? { branchId: scopedBranchId } : {}),
    };

    // CRITICAL FINANCIAL RULE: Only FINAL_APPROVED entries affect P&L, KPIs, and Wallet Balances
    const approvedScope: Record<string, unknown> = {
      ...baseScope,
      approvalStatus: "FINAL_APPROVED",
    };

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = endOfDay(
      new Date(now.getFullYear(), now.getMonth() + 1, 0)
    );

    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const periodStart = startDateParam
      ? startOfDay(new Date(startDateParam))
      : monthStart;
    const periodEnd = endDateParam ? endOfDay(new Date(endDateParam)) : monthEnd;

    const trendStart = startOfDay(
      new Date(now.getTime() - (trendDays - 1) * 24 * 60 * 60 * 1000)
    );

    const queueStatus = getQueueStatusForRole(auth.ctx.role);

    const [
      company,
      branches,
      todayAgg,
      monthAgg,
      periodAgg,
      walletAgg,
      transferInAgg,
      categoryAgg,
      dailyAgg,
      duesAgg,
      pendingQueueCount,
      allPendingAgg,
      recentTransactions,
    ] = await Promise.all([
      Company.findById(companyObjectId).lean(),
      isHQOrSuperAdmin(auth.ctx.role)
        ? Branch.find({ companyId: companyObjectId, isActive: true })
            .sort({ name: 1 })
            .select("_id name code")
            .lean()
        : Promise.resolve([]),
      Transaction.aggregate([
        {
          $match: {
            ...approvedScope,
            type: { $in: ["INCOME", "EXPENSE"] },
            date: { $gte: todayStart, $lte: todayEnd },
          },
        },
        { $group: { _id: "$type", total: { $sum: "$amount" } } },
      ]),
      Transaction.aggregate([
        {
          $match: {
            ...approvedScope,
            type: { $in: ["INCOME", "EXPENSE"] },
            date: { $gte: monthStart, $lte: monthEnd },
          },
        },
        { $group: { _id: "$type", total: { $sum: "$amount" } } },
      ]),
      Transaction.aggregate([
        {
          $match: {
            ...approvedScope,
            type: { $in: ["INCOME", "EXPENSE"] },
            date: { $gte: periodStart, $lte: periodEnd },
          },
        },
        {
          $group: {
            _id: "$type",
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
      Transaction.aggregate([
        { $match: approvedScope },
        {
          $group: {
            _id: { type: "$wallet.type", name: "$wallet.name" },
            income: {
              $sum: { $cond: [{ $eq: ["$type", "INCOME"] }, "$amount", 0] },
            },
            expense: {
              $sum: {
                $cond: [
                  { $in: ["$type", ["EXPENSE", "TRANSFER"]] },
                  "$amount",
                  0,
                ],
              },
            },
          },
        },
      ]),
      Transaction.aggregate([
        {
          $match: {
            ...approvedScope,
            type: "TRANSFER",
            destinationWallet: { $exists: true },
          },
        },
        {
          $group: {
            _id: {
              type: "$destinationWallet.type",
              name: "$destinationWallet.name",
            },
            transferIn: { $sum: "$amount" },
          },
        },
      ]),
      Transaction.aggregate([
        {
          $match: {
            ...approvedScope,
            type: { $in: ["INCOME", "EXPENSE"] },
            date: { $gte: periodStart, $lte: periodEnd },
          },
        },
        {
          $group: {
            _id: { type: "$type", category: "$category" },
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ]),
      Transaction.aggregate([
        {
          $match: {
            ...approvedScope,
            type: { $in: ["INCOME", "EXPENSE"] },
            date: { $gte: trendStart, $lte: todayEnd },
          },
        },
        {
          $group: {
            _id: {
              day: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
              type: "$type",
            },
            total: { $sum: "$amount" },
          },
        },
      ]),
      Contact.aggregate([
        { $match: { companyId: companyObjectId, isActive: true } },
        {
          $group: {
            _id: null,
            totalReceivable: { $sum: "$receivableBalance" },
            totalPayable: { $sum: "$payableBalance" },
            receivableCount: {
              $sum: { $cond: [{ $gt: ["$receivableBalance", 0] }, 1, 0] },
            },
            payableCount: {
              $sum: { $cond: [{ $gt: ["$payableBalance", 0] }, 1, 0] },
            },
          },
        },
      ]),
      queueStatus
        ? Transaction.countDocuments({
            companyId: companyObjectId,
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
          })
        : Promise.resolve(0),
      Transaction.aggregate([
        {
          $match: {
            ...baseScope,
            approvalStatus: {
              $in: ["PENDING_MANAGER", "PENDING_HQ", "PENDING_FINAL"],
            },
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            amount: { $sum: "$amount" },
          },
        },
      ]),
      Transaction.find(baseScope)
        .sort({ date: -1, createdAt: -1 })
        .limit(8)
        .populate("createdBy", "name")
        .populate("branchId", "name code")
        .lean(),
    ]);

    const extractTotals = (
      rows: Array<{ _id: string; total: number; count?: number }>
    ) => {
      const incomeRow = rows.find((r) => r._id === "INCOME");
      const expenseRow = rows.find((r) => r._id === "EXPENSE");
      const income = incomeRow?.total || 0;
      const expense = expenseRow?.total || 0;
      return {
        income,
        expense,
        net: income - expense,
        count: (incomeRow?.count || 0) + (expenseRow?.count || 0),
      };
    };

    const today = extractTotals(todayAgg);
    const month = extractTotals(monthAgg);
    const period = extractTotals(periodAgg);

    const walletMap = new Map<
      string,
      { name: string; type: string; balance: number; income: number; expense: number }
    >();

    // Only include company opening balances on company-wide view (not single-branch filtered view)
    for (const w of (company?.wallets || []).filter((w) => w.isActive)) {
      const key = `${w.type}::${w.name}`;
      walletMap.set(key, {
        name: w.name,
        type: w.type,
        balance: scopedBranchId ? 0 : w.openingBalance || 0,
        income: 0,
        expense: 0,
      });
    }

    for (const row of walletAgg) {
      const key = `${row._id.type}::${row._id.name}`;
      const existing = walletMap.get(key) || {
        name: row._id.name,
        type: row._id.type,
        balance: 0,
        income: 0,
        expense: 0,
      };
      existing.income += row.income;
      existing.expense += row.expense;
      existing.balance += row.income - row.expense;
      walletMap.set(key, existing);
    }

    for (const row of transferInAgg) {
      if (!row._id?.type || !row._id?.name) continue;
      const key = `${row._id.type}::${row._id.name}`;
      const existing = walletMap.get(key) || {
        name: row._id.name,
        type: row._id.type,
        balance: 0,
        income: 0,
        expense: 0,
      };
      existing.income += row.transferIn;
      existing.balance += row.transferIn;
      walletMap.set(key, existing);
    }

    const walletBalances = Array.from(walletMap.values());
    const totalCashInHand = walletBalances.reduce((acc, w) => acc + w.balance, 0);

    const dailyLookup = new Map<string, { income: number; expense: number }>();
    for (const row of dailyAgg) {
      const dayKey = row._id.day as string;
      const entry = dailyLookup.get(dayKey) || { income: 0, expense: 0 };
      if (row._id.type === "INCOME") entry.income = row.total;
      if (row._id.type === "EXPENSE") entry.expense = row.total;
      dailyLookup.set(dayKey, entry);
    }

    const dailyTrend = [];
    for (let i = trendDays - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = toISODateKey(d);
      const val = dailyLookup.get(key) || { income: 0, expense: 0 };
      dailyTrend.push({
        date: key,
        label: new Intl.DateTimeFormat("en-GB", {
          day: "2-digit",
          month: "short",
        }).format(d),
        income: val.income,
        expense: val.expense,
        net: val.income - val.expense,
      });
    }

    const categoryBreakdown = {
      income: categoryAgg
        .filter((c) => c._id.type === "INCOME")
        .map((c) => ({
          category: c._id.category as string,
          total: c.total as number,
          count: c.count as number,
        })),
      expense: categoryAgg
        .filter((c) => c._id.type === "EXPENSE")
        .map((c) => ({
          category: c._id.category as string,
          total: c.total as number,
          count: c.count as number,
        })),
    };

    const duesSummary = duesAgg[0] || {
      totalReceivable: 0,
      totalPayable: 0,
      receivableCount: 0,
      payableCount: 0,
    };

    const allPending = allPendingAgg[0] || { count: 0, amount: 0 };

    return NextResponse.json({
      role: auth.ctx.role,
      companyName: auth.ctx.companyName,
      branchName: auth.ctx.branchName,
      branches: branches.map((b) => ({
        id: b._id.toString(),
        name: b.name,
        code: b.code,
      })),
      today,
      month,
      period,
      totalCashInHand,
      walletBalances,
      categoryBreakdown,
      dailyTrend,
      pendingSummary: {
        myQueueCount: pendingQueueCount,
        totalPendingCount: allPending.count || 0,
        totalPendingAmount: allPending.amount || 0,
      },
      duesSummary: {
        totalReceivable: duesSummary.totalReceivable || 0,
        totalPayable: duesSummary.totalPayable || 0,
        receivableCount: duesSummary.receivableCount || 0,
        payableCount: duesSummary.payableCount || 0,
      },
      recentTransactions: recentTransactions.map((t) => ({
        id: t._id.toString(),
        type: t.type,
        amount: t.amount,
        category: t.category,
        wallet: t.wallet,
        date: t.date,
        note: t.note || "",
        approvalStatus: t.approvalStatus,
        receipt: t.receipt || null,
        branchName:
          (t.branchId as unknown as { name?: string } | null)?.name || "",
        createdByName:
          (t.createdBy as unknown as { name?: string } | null)?.name || "Staff",
      })),
    });
  } catch (error) {
    console.error("[GET /api/analytics] Error:", error);
    return NextResponse.json(
      { error: "Failed to load analytics data." },
      { status: 500 }
    );
  }
}
