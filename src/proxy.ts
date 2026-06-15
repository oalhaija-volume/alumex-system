import { NextResponse, type NextRequest } from "next/server";
import { canAccessRoute, type AppRole } from "@/lib/auth/permissions";
import { normalizeAppRole } from "@/lib/auth/roles";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createProxyClient } from "@/lib/supabase/proxy";

const publicRoutes = ["/login", "/auth/callback"];

function isPublicRoute(pathname: string) {
  return publicRoutes.some((route) => pathname.startsWith(route));
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

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
    .select("role, is_active, status")
    .eq("id", user.id)
    .single();
  const profileData = profile as unknown as {
    role: AppRole | "Sales User" | null;
    is_active?: boolean | null;
    status?: string | null;
  } | null;
  const isInactive =
    profileData?.is_active !== true || profileData?.status === "Inactive";
  const role =
    isInactive
      ? null
      : user.email?.toLowerCase() === "admin@alumex.com"
        ? "Admin"
        : normalizeAppRole(profileData?.role);

  if (!canAccessRoute(pathname, role)) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
