import { NextRequest, NextResponse } from "next/server";
import { getTenantAuthContext } from "@/lib/auth";
import { uploadReceiptBuffer } from "@/lib/cloudinary";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

export async function POST(req: NextRequest) {
  const auth = await getTenantAuthContext();
  if (!auth.ok) return auth.response;

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Please attach an image file." },
        { status: 400 }
      );
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Only JPG, PNG, and WEBP receipt images are allowed." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Receipt image must be smaller than 5 MB." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const uploaded = await uploadReceiptBuffer(
      buffer,
      auth.ctx.companyId,
      file.type
    );

    return NextResponse.json(uploaded, { status: 201 });
  } catch (error) {
    console.error("[POST /api/upload] Error:", error);
    const message =
      error instanceof Error && error.message.includes("Cloudinary")
        ? error.message
        : "Failed to upload receipt image.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
