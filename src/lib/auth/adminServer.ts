import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/permissions";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  const profileData = profile as {
    role: AppRole | null;
    is_active: boolean | null;
  } | null;
  const role =
    profileData?.is_active === false
      ? null
      : user.email?.toLowerCase() === seedAdminEmail
        ? "Admin"
        : profileData?.role ?? null;

  if (role !== "Admin") {
    return { ok: false, status: 403, error: "Admin access is required." };
  }

  return { ok: true, user };
}

