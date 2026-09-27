import { NextResponse, type NextRequest } from "next/server";

// Routes that never require the dashboard login cookie.
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/poll"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  const hasSessionCookie = request.cookies.has("solar_dashboard_session");
  if (!hasSessionCookie) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

// The real session-content check (loggedIn === true) happens in each
// route/page via lib/session.ts; proxy only does the cheap cookie
// presence check to short-circuit obvious unauthenticated requests.
export const config = {
  matcher: [
    /*
     * Match all paths except static assets.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
