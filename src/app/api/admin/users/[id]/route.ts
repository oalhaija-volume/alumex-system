import { NextResponse } from "next/server";
import { requireAdminUser, requireRole } from "@/lib/auth/adminServer";
import type { AppRole } from "@/lib/auth/permissions";
import { isAppRole, normalizeAppRole } from "@/lib/auth/roles";
import { isValidUsername, normalizeUsername } from "@/lib/auth/username";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    role?: unknown;
    isActive?: unknown;
    password?: unknown;
    fullName?: unknown;
    username?: unknown;
  } | null;
  const role = body?.role === undefined ? undefined : body.role;
  const isActive =
    typeof body?.isActive === "boolean" ? body.isActive : undefined;
  const password =
    typeof body?.password === "string" && body.password.trim()
      ? body.password.trim()
      : undefined;
  const fullName =
    typeof body?.fullName === "string" ? body.fullName.trim() : undefined;
  const username =
    typeof body?.username === "string"
      ? normalizeUsername(body.username)
      : undefined;

  if (role !== undefined && !isAppRole(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  if (username !== undefined && !isValidUsername(username)) {
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
      { error: "Only Admin can assign the Admin role." },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  const { data: targetProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", id)
    .maybeSingle();
  const targetRole = normalizeAppRole(
    (targetProfile as { role?: string | null } | null)?.role,
  );

  if (roleCheck.role !== "Admin" && targetRole === "Admin") {
    return NextResponse.json(
      { error: "Only Admin can update Admin users." },
      { status: 403 },
    );
  }

  if (username !== undefined) {
    const { data: existingUsername, error: usernameError } = await admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .neq("id", id)
      .maybeSingle();

    if (usernameError) {
      return NextResponse.json({ error: usernameError.message }, { status: 500 });
    }

    if (existingUsername) {
      return NextResponse.json(
        { error: "Username already exists." },
        { status: 409 },
      );
    }
  }

  if (password) {
    const { data: authUserData } = await admin.auth.admin.getUserById(id);
    const { error: passwordError } = await admin.auth.admin.updateUserById(id, {
      password,
      user_metadata: {
        ...(authUserData.user?.user_metadata ?? {}),
        requires_password_change: true,
      },
    });

    if (passwordError) {
      return NextResponse.json(
        { error: passwordError.message },
        { status: 500 },
      );
    }
  }

  const profileUpdate: {
    role?: AppRole;
    is_active?: boolean;
    full_name?: string | null;
    username?: string;
  } = {};
  const authUpdate: { ban_duration?: string } = {};

  if (role !== undefined) {
    profileUpdate.role = role;
  }

  if (fullName !== undefined) {
    profileUpdate.full_name = fullName || null;
  }

  if (username !== undefined) {
    profileUpdate.username = username;
  }

  if (isActive !== undefined) {
    profileUpdate.is_active = isActive;
    (profileUpdate as { status?: "Active" | "Inactive" }).status = isActive
      ? "Active"
      : "Inactive";
    authUpdate.ban_duration = isActive ? "none" : "876000h";
  }

  if (authUpdate.ban_duration) {
    const { error: authError } = await admin.auth.admin.updateUserById(
      id,
      authUpdate,
    );

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }
  }

  if (Object.keys(profileUpdate).length > 0) {
    const { error: profileError } = await admin
      .from("profiles")
      .update(profileUpdate)
      .eq("id", id);

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const adminCheck = await requireAdminUser();

  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status },
    );
  }

  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: supabaseServiceRoleError },
      { status: 500 },
    );
  }

  const { id } = await context.params;
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
