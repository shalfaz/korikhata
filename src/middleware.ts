import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const PUBLIC_ROUTES = ["/login", "/register", "/setup"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/setup") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  });

  // A session is only valid if it belongs to a Platform Admin OR has a bound companyId.
  // Stale/incomplete cookies (e.g., from pre-ERP sessions) are treated as unauthenticated
  // so /login and / never enter a 307 redirect loop.
  const isPlatformAdmin = token?.isPlatformAdmin === true;
  const hasCompanySession = Boolean(token?.companyId);
  const hasValidSession = Boolean(token && (isPlatformAdmin || hasCompanySession));

  const isPublicPage = PUBLIC_ROUTES.some((route) =>
    pathname.startsWith(route)
  );
  const isPlatformRoute =
    pathname.startsWith("/platform-admin") ||
    pathname.startsWith("/api/platform");

  if (!hasValidSession) {
    if (isPublicPage) {
      return NextResponse.next();
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("callbackUrl", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Valid authenticated session visiting /login or /register -> send to appropriate home
  if (pathname.startsWith("/login") || pathname.startsWith("/register")) {
    const dest = isPlatformAdmin ? "/platform-admin" : "/";
    return NextResponse.redirect(new URL(dest, req.url));
  }

  // Platform Admin isolation
  if (isPlatformAdmin) {
    if (!isPlatformRoute && !pathname.startsWith("/api/")) {
      return NextResponse.redirect(new URL("/platform-admin", req.url));
    }
    return NextResponse.next();
  }

  // Organization users cannot access /platform-admin
  if (isPlatformRoute) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
