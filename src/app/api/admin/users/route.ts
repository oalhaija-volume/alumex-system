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

export async function GET() {
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

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, full_name, role, status, is_active, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: data ?? [] });
}

export async function POST(request: Request) {
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

  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
    role?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password =
    typeof body?.password === "string" ? body.password.trim() : "";
  const role = isRole(body?.role) ? body.role : null;

  if (!email || !password || !role) {
    return NextResponse.json(
      { error: "Email, temporary password, and role are required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role },
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
      role,
      status: "Active",
      is_active: true,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    return NextResponse.json(
      { error: profileError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ user: created.user }, { status: 201 });
}
