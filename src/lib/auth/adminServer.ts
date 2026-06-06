import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey } from "@/lib/supabase/config";

const seedAdminEmail = "admin@alumex.com";

export type AdminCheck =
  | { ok: true; user: User }
  | { ok: false; status: number; error: string };

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
    role: AppRole | null;
    is_active: boolean | null;
    status?: string | null;
  } | null;
  const isInactive =
    profileData?.is_active === false || profileData?.status === "Inactive";
  const role =
    isInactive
      ? null
      : user.email?.toLowerCase() === seedAdminEmail
        ? "Admin"
        : profileData?.role ?? null;

  if (role !== "Admin") {
    return { ok: false, status: 403, error: "Admin access is required." };
  }

  return { ok: true, user };
}
