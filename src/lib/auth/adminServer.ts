import { headers } from "next/headers";
import { usesMobileWorkspace } from "@/lib/auth/mobileAccess";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { normalizeAppRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey } from "@/lib/supabase/config";

const seedAdminEmail = "admin@alumex.com";

export type AdminCheck =
  | { ok: true; user: User }
  | { ok: false; status: number; error: string };

export type RoleCheck =
  | {
      ok: true;
      user: User;
      role: AppRole;
      mobileOutdoor: boolean;
      outdoorTeamMemberIds?: string[];
      profile: {
        full_name: string | null;
        username: string | null;
        role: AppRole | "Sales User" | null;
        is_active: boolean | null;
        branch: string | null;
        status?: string | null;
        outdoor_team_key?: string | null;
      } | null;
    }
  | { ok: false; status: number; error: string };

function isInactiveProfile(
  profile:
    | {
        is_active: boolean | null;
        status?: string | null;
      }
    | null,
) {
  return profile?.is_active !== true || profile?.status === "Inactive";
}

export async function requireRole(
  allowedRoles: readonly AppRole[],
): Promise<RoleCheck> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, status: 401, error: "Authentication is required." };
  }

  const profileClient = hasSupabaseServiceRoleKey()
    ? createAdminClient()
    : supabase;
  const { data: profile, error: profileError } = await profileClient
    .from("profiles")
    .select("full_name, username, role, is_active, status, branch, outdoor_team_key")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[auth] profile lookup failed", profileError);
    return { ok: false, status: 500, error: "Unable to verify permissions." };
  }

  const profileData = profile as {
    full_name: string | null;
    username: string | null;
    role: AppRole | "Sales User" | null;
    is_active: boolean | null;
    branch: string | null;
    status?: string | null;
    outdoor_team_key?: string | null;
  } | null;
  const role =
    isInactiveProfile(profileData)
      ? null
      : user.email?.toLowerCase() === seedAdminEmail
        ? "Admin"
        : normalizeAppRole(profileData?.role);

  if (!role || (role !== "Admin" && !allowedRoles.includes(role))) {
    return {
      ok: false,
      status: 403,
      error: "You do not have permission to complete this action.",
    };
  }

  const mobileOutdoor = role === "Outdoor Sales" && usesMobileWorkspace(role, await headers());
  let outdoorTeamMemberIds: string[] | undefined;
  if (role === 'Outdoor Sales') {
    outdoorTeamMemberIds = [user.id];
    if (profileData?.outdoor_team_key) {
      const members = await profileClient.from('profiles').select('id')
        .eq('outdoor_team_key', profileData.outdoor_team_key).eq('role', 'Outdoor Sales')
        .eq('branch', profileData.branch ?? '')
        .eq('is_active', true).eq('status', 'Active');
      if (members.error) return { ok: false, status: 503, error: 'Unable to verify your Outdoor Sales team.' };
      outdoorTeamMemberIds = [...new Set([user.id, ...members.data.map(member => member.id)])];
    }
  }
  return { ok: true, user, role, mobileOutdoor, profile: profileData, outdoorTeamMemberIds };
}

export async function requireAdminUser(): Promise<AdminCheck> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, status: 401, error: "Authentication is required." };
  }

  const profileClient = hasSupabaseServiceRoleKey()
    ? createAdminClient()
    : supabase;
  const { data: profile } = await profileClient
    .from("profiles")
    .select("role, is_active, status")
    .eq("id", user.id)
    .maybeSingle();

  const profileData = profile as {
    role: AppRole | "Sales User" | null;
    is_active: boolean | null;
    status?: string | null;
  } | null;
  const isInactive = isInactiveProfile(profileData);
  const role =
    isInactive
      ? null
      : user.email?.toLowerCase() === seedAdminEmail
        ? "Admin"
        : normalizeAppRole(profileData?.role);

  if (role !== "Admin") {
    return { ok: false, status: 403, error: "Admin access is required." };
  }

  return { ok: true, user };
}
