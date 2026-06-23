import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { isAppRole } from "@/lib/auth/roles";
import {
  authEmailForUsername,
  isValidUsername,
  normalizeUsername,
  usernameFromEmail,
} from "@/lib/auth/username";
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
    error.message?.toLowerCase().includes("column profiles.username does not exist") ||
    error.message?.toLowerCase().includes("could not find the 'username' column")
  );
}

export async function GET() {
  const roleCheck = await requireRole(["Admin", "HR"]);

  if (!roleCheck.ok) {
    return NextResponse.json(
      { error: roleCheck.error },
      { status: roleCheck.status },
    );
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
    .select("id, email, username, full_name, role, status, is_active, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingUsernameColumn(error)) {
      const { data: fallbackData, error: fallbackError } = await admin
        .from("profiles")
        .select("id, email, full_name, role, status, is_active, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (fallbackError) {
        return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      }

      return NextResponse.json({
        users: (fallbackData ?? []).map((user) => ({
          ...user,
          username: null,
        })),
        warning: usernameColumnMissingError,
      });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data ?? [] });
}

export async function POST(request: Request) {
  const roleCheck = await requireRole(["Admin", "HR"]);

  if (!roleCheck.ok) {
    return NextResponse.json(
      { error: roleCheck.error },
      { status: roleCheck.status },
    );
  }

  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: supabaseServiceRoleError },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    username?: unknown;
    password?: unknown;
    role?: unknown;
    fullName?: unknown;
  } | null;
  const providedEmail = typeof body?.email === "string" ? body.email.trim() : "";
  const username =
    typeof body?.username === "string"
      ? normalizeUsername(body.username)
      : usernameFromEmail(providedEmail);
  const email = providedEmail || authEmailForUsername(username);
  const password =
    typeof body?.password === "string" ? body.password.trim() : "";
  const role = isAppRole(body?.role) ? body.role : null;
  const fullName =
    typeof body?.fullName === "string" ? body.fullName.trim() : "";

  if (!username || !password || !role) {
    return NextResponse.json(
      { error: "Username, temporary password, and role are required." },
      { status: 400 },
    );
  }

  if (!isValidUsername(username)) {
    return NextResponse.json(
      {
        error:
          "Username must be 3-64 lowercase letters, numbers, dots, dashes, or underscores.",
      },
      { status: 400 },
    );
  }

  if (roleCheck.role !== "Admin" && role === "Admin") {
    return NextResponse.json(
      { error: "Only Admin can create Admin users." },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const { data: existingUsername, error: usernameError } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (usernameError) {
    if (isMissingUsernameColumn(usernameError)) {
      return NextResponse.json(
        { error: usernameColumnMissingError },
        { status: 500 },
      );
    }

    return NextResponse.json({ error: usernameError.message }, { status: 500 });
  }

  if (existingUsername) {
    return NextResponse.json(
      { error: "Username already exists." },
      { status: 409 },
    );
  }

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role,
        full_name: fullName || undefined,
        username,
        requires_password_change: true,
      },
    });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? "Unable to create user." },
      { status: 500 },
    );
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: created.user.id,
      email: email.toLowerCase(),
      username,
      full_name: fullName || null,
      role,
      status: "Active",
      is_active: true,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    if (isMissingUsernameColumn(profileError)) {
      return NextResponse.json(
        { error: usernameColumnMissingError },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: profileError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ user: created.user }, { status: 201 });
}
