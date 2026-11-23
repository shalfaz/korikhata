import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import { getTenantAuthContext } from "@/lib/auth";
import { AuditLog } from "@/models";

export async function GET(req: NextRequest) {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") || 50), 100);

    const logs = await AuditLog.find({ companyId: auth.ctx.companyId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("actorId", "name email")
      .lean();

    const formatted = logs.map((log) => {
      const actor = log.actorId as unknown as {
        _id?: { toString(): string };
        name?: string;
        email?: string;
      } | null;

      return {
        id: log._id.toString(),
        action: log.action,
        entityType: log.entityType,
        summary: log.summary,
        actorName: actor?.name || "System",
        actorEmail: actor?.email || "",
        createdAt: log.createdAt,
      };
    });

    return NextResponse.json({ logs: formatted });
  } catch (error) {
    console.error("[GET /api/audit-logs] Error:", error);
    return NextResponse.json(
      { error: "Failed to load audit logs." },
      { status: 500 }
    );
  }
}
