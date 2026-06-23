import { NextResponse } from "next/server";
import { normalizeUsername } from "@/lib/auth/username";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

const usernameColumnMissingError =
  "Username login is not installed in Supabase yet. Run supabase/manual_sql/20260622_login_username.sql.";

function isMissingUsernameColumn(error: { message?: string; code?: string }) {
  return (
    error.code === "42703" ||
    error.message?.toLowerCase().includes("profiles.username does not exist") ||
    error.message?.toLowerCase().includes("column profiles.username does not exist")
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    username?: unknown;
  } | null;
  const identifier =
    typeof body?.username === "string" ? normalizeUsername(body.username) : "";

  if (!identifier) {
    return NextResponse.json(
      { error: "Username is required." },
      { status: 400 },
    );
  }

  if (identifier.includes("@")) {
    return NextResponse.json({ email: identifier });
  }

  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: supabaseServiceRoleError },
      { status: 500 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("email, is_active, status")
    .eq("username", identifier)
    .maybeSingle();

  if (error) {
    if (isMissingUsernameColumn(error)) {
      return NextResponse.json(
        { error: usernameColumnMissingError },
        { status: 500 },
      );
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const profile = data as
    | { email: string | null; is_active: boolean | null; status: string | null }
    | null;

  if (!profile?.email) {
    return NextResponse.json(
      { error: "Username or password is incorrect." },
      { status: 401 },
    );
  }

  if (profile.is_active === false || profile.status === "Inactive") {
    return NextResponse.json(
      { error: "This user account is inactive." },
      { status: 403 },
    );
  }

  return NextResponse.json({ email: profile.email.toLowerCase() });
}
