import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import dbConnect from "@/lib/dbConnect";
import { User } from "@/models";

const setupSchema = z.object({
  setupKey: z.string().trim().min(1, "Platform Setup Key is required"),
  name: z.string().trim().min(2, "Full name is required").max(100),
  email: z.string().trim().email("Valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
});

function timingSafeMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function GET() {
  try {
    await dbConnect();
    const exists = await User.exists({ isPlatformAdmin: true });
    const setupKeyConfigured = Boolean(process.env.PLATFORM_SETUP_KEY?.trim());
    return NextResponse.json({
      initialized: Boolean(exists),
      setupKeyConfigured,
    });
  } catch (error) {
    console.error("[GET /api/setup] Error:", error);
    return NextResponse.json(
      { error: "Unable to check platform initialization status." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const expectedKey = process.env.PLATFORM_SETUP_KEY?.trim();
    if (!expectedKey) {
      return NextResponse.json(
        {
          error:
            "PLATFORM_SETUP_KEY is not configured. Define it in .env.local and restart the server.",
        },
        { status: 503 }
      );
    }

    await dbConnect();

    const existingAdmin = await User.exists({ isPlatformAdmin: true });
    if (existingAdmin) {
      return NextResponse.json(
        { error: "Platform Super Admin is already initialized." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = setupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }

    if (!timingSafeMatch(parsed.data.setupKey?.trim() || "", expectedKey)) {
      return NextResponse.json(
        { error: "Invalid Platform Setup Key." },
        { status: 403 }
      );
    }

    const normalizedEmail = parsed.data.email.toLowerCase();
    const emailTaken = await User.exists({ email: normalizedEmail });
    if (emailTaken) {
      return NextResponse.json(
        { error: "This email is already registered." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    const admin = await User.create({
      name: parsed.data.name,
      email: normalizedEmail,
      employeeCode: "PLATFORM-ROOT",
      passwordHash,
      authProvider: "credentials",
      isPlatformAdmin: true,
      platformRole: "ROOT_OWNER",
      role: "COMPANY_SUPER_ADMIN",
      isActive: true,
    });

    return NextResponse.json(
      {
        message: "KoriKhata Platform Super Admin initialized successfully.",
        admin: {
          id: admin._id.toString(),
          name: admin.name,
          email: admin.email,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/setup] Error:", error);
    return NextResponse.json(
      { error: "Failed to initialize Platform Super Admin." },
      { status: 500 }
    );
  }
}
