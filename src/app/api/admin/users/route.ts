import { leadershipRoles } from '@/lib/auth/permissions';
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { isAppRole } from "@/lib/auth/roles";
import {
  authEmailForUsername,
  isValidUsername,
  normalizeUsername,
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
  const roleCheck = await requireRole([...leadershipRoles, "HR"]);

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
  const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const username = typeof body?.username === "string" ? normalizeUsername(body.username) : "";
  const email = authEmailForUsername(username);
  const password = typeof body?.password === "string" ? body.password : "";
  const role = isAppRole(body?.role) ? body.role : null;

  if (!fullName || fullName.length > 150 || !username || password.length < 8 || !role || !["Admin","HR","Sales Director","CEO","Company Owner","Indoor Sales","Outdoor Sales","Operations Manager","Project Manager"].includes(role)) {
    return NextResponse.json(
      { error: "Enter employee name, username, role, and a password of at least 8 characters." },
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

  if (roleCheck.role !== "Admin" && (role === "Admin" || role === "Company Owner")) {
    return NextResponse.json(
      { error: "Only Admin can create Admin or Company Owner users." },
      { status: 403 },
    );
  }

  const admin = createAdminClient();
  if (role === "Company Owner") {
    const readiness = await admin.rpc("company_owner_ready", {});
    if (readiness.error || readiness.data !== true) return NextResponse.json({error:"Apply the Company Owner database migrations before adding owner accounts."}, {status:503});
  }
  if (role === "Sales Director" || role === "CEO") {
    const readiness = await admin.rpc("sales_leadership_ready", {});
    if (readiness.error || readiness.data !== true) {
      return NextResponse.json({error:"Apply the sales leadership database migrations before adding Sales Director or CEO accounts."}, {status:503});
    }
  }
  if (role === "Operations Manager" || role === "Project Manager") {
    const privacy = await admin.rpc("commercial_privacy_ready", {});
    if (privacy.error || privacy.data !== true) return NextResponse.json({error:"Apply the commercial privacy database migration before adding manager accounts."}, {status:503});
  }
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
        requires_password_change: false,
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
    await admin.auth.admin.deleteUser(created.user.id);
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

  return NextResponse.json(
    { user: { id: created.user.id, username, full_name: fullName, role } },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request) {
  const actor = await requireRole(["Admin", "HR"]);
  if (!actor.ok) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json({ error: supabaseServiceRoleError }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as {
    id?: unknown; action?: unknown; password?: unknown; fullName?: unknown;
    username?: unknown; role?: unknown; isActive?: unknown; updatedAt?: unknown;
  } | null;
  if (!body || typeof body.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)) {
    return NextResponse.json({ error: "Employee is required." }, { status: 400 });
  }
  const admin = createAdminClient();

  // Password resets are a separate action: a profile save never changes Auth
  // credentials, and a failed reset never silently saves part of a profile edit.
  if (body.action === "reset-password") {
    if (actor.role !== "Admin") {
      return NextResponse.json({ error: "Only Admin can reset employee passwords." }, { status: 403 });
    }
    if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128) {
      return NextResponse.json({ error: "Enter a new password of 8–128 characters." }, { status: 400 });
    }
    const { data: employee, error: lookupError } = await admin.from("profiles")
      .select("id").eq("id", body.id).maybeSingle();
    if (lookupError) return NextResponse.json({ error: "Unable to load employee." }, { status: 500 });
    if (!employee) return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    const { error } = await admin.auth.admin.updateUserById(employee.id, { password: body.password });
    if (error) {
      return NextResponse.json({ error: "Unable to reset password. Use a different password and try again." }, { status: 400 });
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }
  if (body.action !== "update-profile") {
    return NextResponse.json({ error: "Invalid employee action." }, { status: 400 });
  }
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const username = typeof body.username === "string" ? normalizeUsername(body.username) : "";
  if (!fullName || fullName.length > 150 || !isValidUsername(username) ||
      (!isAppRole(body.role) && body.role !== "Sales User") || typeof body.isActive !== "boolean" ||
      typeof body.updatedAt !== "string" || !Number.isFinite(Date.parse(body.updatedAt))) {
    return NextResponse.json({ error: "Enter a valid employee name, username, role and status." }, { status: 400 });
  }
  const { data, error } = await admin.rpc("update_employee_profile", {
    p_actor: actor.user.id, p_employee: body.id, p_expected_updated_at: body.updatedAt,
    p_full_name: fullName, p_username: username, p_role: body.role, p_is_active: body.isActive,
  });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Username already exists." }, { status: 409 });
    if (error.code === "PGRST202" || error.code === "42883") {
      return NextResponse.json({ error: "Apply the employee editing database migration before saving changes." }, { status: 503 });
    }
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "40001" ? 409 : error.code === "22023" ? 400 : 500;
    return NextResponse.json({ error: status === 500 ? "Unable to update employee. Please try again." : error.message }, { status });
  }
  return NextResponse.json({ user: data }, { headers: { "Cache-Control": "no-store" } });
}
