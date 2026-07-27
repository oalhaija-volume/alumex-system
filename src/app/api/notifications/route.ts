import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { isMissingDatabaseObjectError } from "@/lib/friendlyErrors";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

const notificationRoles = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Outdoor Sales",
  "Sales Rep",
  "Branch Manager",
  "Operations Manager",
] as const;

export async function GET() {
  const auth = await requireRole(notificationRoles);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status },
    );
  }
  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: supabaseServiceRoleError },
      { status: 500 },
    );
  }

  const { data, error } = await createAdminClient()
    .from("notifications")
    .select(
      "id, notification_kind, title_key, message_key, link_path, payload, read_at, created_at",
    )
    .eq("recipient_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) {
    if (isMissingDatabaseObjectError(error)) {
      return NextResponse.json({
        notifications: [],
        setupRequired: true,
      });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ notifications: data ?? [] });
}

export async function PATCH(request: Request) {
  const auth = await requireRole(notificationRoles);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status },
    );
  }
  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: supabaseServiceRoleError },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { notificationId?: unknown; all?: unknown }
    | null;
  const admin = createAdminClient();
  let query = admin
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", auth.user.id)
    .is("read_at", null);

  if (body?.all !== true) {
    const notificationId =
      typeof body?.notificationId === "string"
        ? body.notificationId.trim()
        : "";
    if (!notificationId) {
      return NextResponse.json(
        { error: "Notification id is required." },
        { status: 400 },
      );
    }
    query = query.eq("id", notificationId);
  }

  const { error } = await query;
  if (error) {
    if (isMissingDatabaseObjectError(error)) {
      return NextResponse.json({
        updated: false,
        setupRequired: true,
      });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ updated: true });
}
