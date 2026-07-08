import { NextResponse, type NextRequest } from "next/server";
import {
  canAccessRouteWithOverrides,
  defaultRouteForRole,
  type AppRole,
} from "@/lib/auth/permissions";
import { normalizeAppRole } from "@/lib/auth/roles";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createProxyClient } from "@/lib/supabase/proxy";

const publicRoutes = ["/login", "/auth/callback"];
const supabaseAuthCookiePattern = /^sb-.+-auth-token(?:\.\d+)?$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isPublicRoute(pathname: string) {
  return publicRoutes.some((route) => pathname.startsWith(route));
}

function isInvalidRefreshTokenError(error: { message?: string } | null) {
  return error?.message?.toLowerCase().includes("invalid refresh token") === true;
}

function clearSupabaseAuthCookies(request: NextRequest, response: NextResponse) {
  request.cookies
    .getAll()
    .filter((cookie) => supabaseAuthCookiePattern.test(cookie.name))
    .forEach((cookie) => {
      response.cookies.delete(cookie.name);
    });

  return response;
}

function measurementProjectIdFromPath(pathname: string) {
  const [, section, projectId] = pathname.split("/");

  return section === "site-measurements" && uuidPattern.test(projectId ?? "")
    ? projectId
    : null;
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

  const { supabase, response } = createProxyClient(request);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (isInvalidRefreshTokenError(userError)) {
    if (isPublicRoute(pathname)) {
      return clearSupabaseAuthCookies(request, response);
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return clearSupabaseAuthCookies(
      request,
      NextResponse.redirect(loginUrl),
    );
  }

  if (isPublicRoute(pathname)) {
    if (!user || pathname !== "/login") {
      return response;
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
    const role =
      profileData?.is_active !== true || profileData?.status === "Inactive"
        ? null
        : user.email?.toLowerCase() === "admin@alumex.com"
          ? "Admin"
          : normalizeAppRole(profileData?.role);

    return NextResponse.redirect(new URL(defaultRouteForRole(role), request.url));
  }

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isAdminEmail = user.email?.toLowerCase() === "admin@alumex.com";
  const [profileResult, pageAccessResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("role, is_active, status")
      .eq("id", user.id)
      .single(),
    isAdminEmail
      ? Promise.resolve({ data: [] })
      : supabase
          .from("employee_page_access")
          .select("route_path, can_access")
          .eq("user_id", user.id),
  ]);
  const { data: profile } = profileResult;
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
      : isAdminEmail
        ? "Admin"
      : normalizeAppRole(profileData?.role);

  if (pathname === "/") {
    return NextResponse.redirect(new URL(defaultRouteForRole(role), request.url));
  }

  const pageAccess = role && role !== "Admin" ? pageAccessResult.data : [];
  const measurementProjectId = measurementProjectIdFromPath(pathname);

  if (
    measurementProjectId &&
    (role === "Project Engineer" || role === "Site Engineer")
  ) {
    const { data: assignedProject } = await supabase
      .from("projects")
      .select("project_engineer_id, site_engineer_id")
      .eq("id", measurementProjectId)
      .maybeSingle();
    const projectAssignment = assignedProject as {
      project_engineer_id: string | null;
      site_engineer_id: string | null;
    } | null;
    const canOpenAssignedMeasurement =
      (role === "Project Engineer" &&
        projectAssignment?.project_engineer_id === user.id) ||
      (role === "Site Engineer" &&
        projectAssignment?.site_engineer_id === user.id);

    if (canOpenAssignedMeasurement) {
      return response;
    }
  }

  if (!canAccessRouteWithOverrides(pathname, role, pageAccess ?? [])) {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
