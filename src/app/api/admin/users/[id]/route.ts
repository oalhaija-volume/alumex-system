import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/adminServer";
import type { AppRole } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

const roles: AppRole[] = ["Admin", "Sales Manager", "Sales User"];

function isRole(value: unknown): value is AppRole {
  return roles.includes(value as AppRole);
}

export async function PATCH(
  request: Request,
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
  const body = (await request.json().catch(() => null)) as {
    role?: unknown;
    isActive?: unknown;
    password?: unknown;
  } | null;
  const role = body?.role === undefined ? undefined : body.role;
  const isActive =
    typeof body?.isActive === "boolean" ? body.isActive : undefined;
  const password =
    typeof body?.password === "string" && body.password.trim()
      ? body.password.trim()
      : undefined;

  if (role !== undefined && !isRole(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  const admin = createAdminClient();

  if (password) {
    const { error: passwordError } = await admin.auth.admin.updateUserById(id, {
      password,
    });

    if (passwordError) {
      return NextResponse.json(
        { error: passwordError.message },
        { status: 500 },
      );
    }
  }

  const profileUpdate: { role?: AppRole; is_active?: boolean } = {};

  if (role !== undefined) {
    profileUpdate.role = role;
  }

  if (isActive !== undefined) {
    profileUpdate.is_active = isActive;
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

