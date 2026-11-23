import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Workspace switching is disabled. Accounts are strictly bound to a single organization.",
    },
    { status: 403 }
  );
}
