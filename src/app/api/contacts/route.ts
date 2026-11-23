import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import dbConnect from "@/lib/dbConnect";
import { canManageDues, getTenantAuthContext } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { Contact, CONTACT_ROLES, DUE_DIRECTIONS } from "@/models";
import { formatBDT } from "@/lib/utils";

const createContactSchema = z.object({
  name: z.string().trim().min(2, "Contact name is required").max(120),
  phone: z.string().trim().max(30).optional(),
  email: z.string().trim().email().or(z.literal("")).optional(),
  address: z.string().trim().max(300).optional(),
  role: z.enum(CONTACT_ROLES).default("CUSTOMER"),
  openingDueAmount: z.coerce.number().min(0).default(0),
  openingDueDirection: z.enum(DUE_DIRECTIONS).default("RECEIVABLE"),
  nextDueDate: z.string().optional(),
  notes: z.string().trim().max(500).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const tab = searchParams.get("tab") || "all"; // receivable | payable | all
    const search = searchParams.get("search")?.trim();

    const filter: Record<string, unknown> = {
      companyId: new Types.ObjectId(auth.ctx.companyId),
      isActive: true,
    };

    if (tab === "receivable") {
      filter.receivableBalance = { $gt: 0 };
    } else if (tab === "payable") {
      filter.payableBalance = { $gt: 0 };
    }

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { phone: { $regex: escaped, $options: "i" } },
      ];
    }

    const [contacts, summaryAgg] = await Promise.all([
      Contact.find(filter)
        .sort({ receivableBalance: -1, payableBalance: -1, lastActivityAt: -1 })
        .limit(200)
        .lean(),
      Contact.aggregate([
        {
          $match: {
            companyId: new Types.ObjectId(auth.ctx.companyId),
            isActive: true,
          },
        },
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
    ]);

    const summary = summaryAgg[0] || {
      totalReceivable: 0,
      totalPayable: 0,
      receivableCount: 0,
      payableCount: 0,
    };

    const items = contacts.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      phone: c.phone || "",
      email: c.email || "",
      address: c.address || "",
      role: c.role,
      receivableBalance: c.receivableBalance,
      payableBalance: c.payableBalance,
      nextDueDate: c.nextDueDate || null,
      notes: c.notes || "",
      lastActivityAt: c.lastActivityAt,
      dueHistory: (c.dueHistory || [])
        .slice()
        .reverse()
        .slice(0, 25)
        .map((h) => ({
          id: h._id?.toString() || "",
          entryType: h.entryType,
          direction: h.direction,
          amount: h.amount,
          date: h.date,
          note: h.note || "",
        })),
    }));

    return NextResponse.json({
      contacts: items,
      summary: {
        totalReceivable: summary.totalReceivable || 0,
        totalPayable: summary.totalPayable || 0,
        receivableCount: summary.receivableCount || 0,
        payableCount: summary.payableCount || 0,
      },
      companyName: auth.ctx.companyName,
    });
  } catch (error) {
    console.error("[GET /api/contacts] Error:", error);
    return NextResponse.json(
      { error: "Failed to load dues & contacts." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  if (!canManageDues(auth.ctx.role)) {
    return NextResponse.json(
      { error: "Only Managers, HQ Officers, and Super Admins can add contacts." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const parsed = createContactSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid contact details" },
        { status: 400 }
      );
    }

    await dbConnect();
    const data = parsed.data;

    const receivableBalance =
      data.openingDueAmount > 0 && data.openingDueDirection === "RECEIVABLE"
        ? data.openingDueAmount
        : 0;
    const payableBalance =
      data.openingDueAmount > 0 && data.openingDueDirection === "PAYABLE"
        ? data.openingDueAmount
        : 0;

    const dueHistory =
      data.openingDueAmount > 0
        ? [
            {
              entryType: "DUE_ADDED" as const,
              direction: data.openingDueDirection,
              amount: data.openingDueAmount,
              date: new Date(),
              note: data.notes || "Opening due balance",
              recordedBy: new Types.ObjectId(auth.ctx.userId),
            },
          ]
        : [];

    const contact = await Contact.create({
      companyId: auth.ctx.companyId,
      name: data.name,
      phone: data.phone,
      email: data.email || undefined,
      address: data.address,
      role: data.role,
      receivableBalance,
      payableBalance,
      nextDueDate: data.nextDueDate ? new Date(data.nextDueDate) : undefined,
      dueHistory,
      notes: data.notes,
      lastActivityAt: new Date(),
      createdBy: auth.ctx.userId,
    });

    await recordAuditLog({
      companyId: auth.ctx.companyId,
      actorId: auth.ctx.userId,
      action: "CREATE",
      entityType: "CONTACT",
      entityId: contact._id,
      summary: `Added ${data.role.toLowerCase()} "${contact.name}"${
        data.openingDueAmount > 0
          ? ` with ${data.openingDueDirection.toLowerCase()} due ${formatBDT(data.openingDueAmount)}`
          : ""
      }`,
    });

    return NextResponse.json(
      {
        message: "Contact added successfully.",
        contact: {
          id: contact._id.toString(),
          name: contact.name,
          receivableBalance: contact.receivableBalance,
          payableBalance: contact.payableBalance,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/contacts] Error:", error);
    return NextResponse.json(
      { error: "Failed to create contact." },
      { status: 500 }
    );
  }
}
