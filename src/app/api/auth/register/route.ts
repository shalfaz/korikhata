import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Public self-registration is disabled. Contact the KoriKhata Platform Admin to onboard your organization.",
    },
    { status: 403 }
  );
}
