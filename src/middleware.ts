import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("mm_session")?.value;
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);
  if (!token && pathname !== "/login" && pathname !== "/api/health") {
    const login = new URL("/login", request.url);
    return NextResponse.redirect(login);
  }
  if (token && pathname === "/login") {
    return NextResponse.redirect(new URL("/desk", request.url));
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js|manifest.webmanifest|offline.html).*)"],
};
