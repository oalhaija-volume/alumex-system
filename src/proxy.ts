import { NextResponse, type NextRequest } from "next/server";
import { hasDevSession, isDemoLoginEnabled } from "@/lib/auth/devSession";
import { canAccessRoute, type AppRole } from "@/lib/auth/permissions";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createProxyClient } from "@/lib/supabase/proxy";

const publicRoutes = ["/login", "/auth/callback"];

function isPublicRoute(pathname: string) {
  return publicRoutes.some((route) => pathname.startsWith(route));
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isDevSession = isDemoLoginEnabled && hasDevSession(request);

  if (isDevSession) {
    if (isPublicRoute(pathname) || pathname === "/unauthorized") {
      if (pathname === "/login") {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }

      return NextResponse.next();
    }

    if (canAccessRoute(pathname, "Admin")) {
      return NextResponse.next();
    }
  }

  if (!hasSupabaseConfig()) {
    if (isPublicRoute(pathname) || pathname === "/unauthorized") {
      return NextResponse.next();
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    loginUrl.searchParams.set("configuration", "missing");
    return NextResponse.redirect(loginUrl);
  }

  if (isPublicRoute(pathname)) {
    const { supabase, response } = createProxyClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && pathname === "/login") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }

    return response;
  }

  const { supabase, response } = createProxyClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();
  const profileData = profile as unknown as {
    role: AppRole | null;
    is_active?: boolean | null;
  } | null;
  const role =
    profileData?.is_active === false
      ? null
      : user.email?.toLowerCase() === "admin@alumex.com"
        ? "Admin"
        : profileData?.role ?? null;

  if (!canAccessRoute(pathname, role)) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
