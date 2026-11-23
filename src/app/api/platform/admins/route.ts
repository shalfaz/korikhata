import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { z } from "zod";
import dbConnect from "@/lib/dbConnect";
import { getRootOwnerContext } from "@/lib/auth";
import { User } from "@/models";

const createSubAdminSchema = z.object({
  name: z.string().trim().min(2, "Full name is required").max(100),
  email: z.string().trim().email("Valid email is required"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(100),
});

const revokeSubAdminSchema = z.object({
  adminId: z.string().min(1, "adminId is required"),
});

export async function GET() {
  const auth = await getRootOwnerContext();
  if (!auth.ok) return auth.response;

  try {
    await dbConnect();

    const admins = await User.find({ isPlatformAdmin: true })
      .sort({ createdAt: 1 })
      .select("name email platformRole isActive createdAt")
      .lean();

    const items = admins.map((a) => ({
      id: a._id.toString(),
      name: a.name,
      email: a.email,
      platformRole: a.platformRole || "ROOT_OWNER",
      isActive: a.isActive,
      createdAt: a.createdAt,
    }));

    return NextResponse.json({ admins: items });
  } catch (error) {
    console.error("[GET /api/platform/admins] Error:", error);
    return NextResponse.json(
      { error: "Failed to load platform admins." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await getRootOwnerContext();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const parsed = createSubAdminSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    await dbConnect();

    const normalizedEmail = parsed.data.email.toLowerCase();
    const exists = await User.exists({ email: normalizedEmail });
    if (exists) {
      return NextResponse.json(
        { error: `Email "${normalizedEmail}" is already registered.` },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    const subAdmin = await User.create({
      name: parsed.data.name,
      email: normalizedEmail,
      employeeCode: `PLT-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      passwordHash,
      authProvider: "credentials",
      isPlatformAdmin: true,
      platformRole: "PLATFORM_ADMIN",
      role: "COMPANY_SUPER_ADMIN",
      isActive: true,
    });

    return NextResponse.json(
      {
        message: `Platform Admin "${subAdmin.name}" (${subAdmin.email}) created.`,
        admin: {
          id: subAdmin._id.toString(),
          name: subAdmin.name,
          email: subAdmin.email,
          platformRole: subAdmin.platformRole,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/platform/admins] Error:", error);
    return NextResponse.json(
      { error: "Failed to create Platform Admin." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await getRootOwnerContext();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const parsed = revokeSubAdminSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid adminId." },
        { status: 400 }
      );
    }

    const { adminId } = parsed.data;
    if (!Types.ObjectId.isValid(adminId)) {
      return NextResponse.json({ error: "Invalid adminId." }, { status: 400 });
    }

    if (adminId === auth.admin.userId) {
      return NextResponse.json(
        { error: "You cannot revoke your own Root Owner account." },
        { status: 400 }
      );
    }

    await dbConnect();

    const target = await User.findOne({
      _id: adminId,
      isPlatformAdmin: true,
    });

    if (!target) {
      return NextResponse.json(
        { error: "Platform Admin not found." },
        { status: 404 }
      );
    }

    const targetRole = target.platformRole || "ROOT_OWNER";
    if (targetRole === "ROOT_OWNER") {
      return NextResponse.json(
        { error: "Root Owner accounts cannot be revoked." },
        { status: 403 }
      );
    }

    await User.deleteOne({ _id: target._id });

    return NextResponse.json({
      message: `Revoked Platform Admin access for ${target.name} (${target.email}).`,
    });
  } catch (error) {
    console.error("[DELETE /api/platform/admins] Error:", error);
    return NextResponse.json(
      { error: "Failed to revoke Platform Admin." },
      { status: 500 }
    );
  }
}
