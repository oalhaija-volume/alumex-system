import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { pageAccessItems } from "@/lib/auth/pageAccess";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";

type PageAccessPayload = {
  userId?: unknown;
  access?: unknown;
};

type PageAccessItemPayload = {
  route_path?: unknown;
  can_access?: unknown;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedRoutePaths = new Set(
  pageAccessItems.map((item) => item.routePath),
);
const pageAccessSelect =
  "id, user_id, route_path, can_access, created_at, updated_at";

function logPageAccessError(operation: "select" | "delete" | "upsert", error: unknown) {
  console.error("[api/hr/page-access] Supabase error", {
    route: "/api/hr/page-access",
    operation,
    table: "public.employee_page_access",
    client: "createAdminClient",
    executingRole: "service_role",
    error,
  });
}

function mapAccessPayload(access: unknown, userId: string, adminUserId: string) {
  if (!Array.isArray(access)) {
    return [];
  }

  return access.reduce<
    Array<{
      user_id: string;
      route_path: string;
      can_access: boolean;
      created_by: string;
    }>
  >((items, item) => {
    const row = item as PageAccessItemPayload;
    const routePath = typeof row.route_path === "string" ? row.route_path : "";

    if (allowedRoutePaths.has(routePath)) {
      items.push({
        user_id: userId,
        route_path: routePath,
        can_access: row.can_access === true,
        created_by: adminUserId,
      });
    }

    return items;
  }, []);
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
    .from("employee_page_access")
    .select(pageAccessSelect)
    .order("route_path", { ascending: true });

  if (error) {
    logPageAccessError("select", error);
    return NextResponse.json(
      { error: friendlyDatabaseError(error, "Unable to load page access.") },
      { status: 500 },
    );
  }

  return NextResponse.json({ access: data ?? [] });
}

export async function PUT(request: Request) {
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

  const body = (await request.json().catch(() => null)) as PageAccessPayload | null;
  const userId = typeof body?.userId === "string" ? body.userId : "";

  if (!uuidPattern.test(userId)) {
    return NextResponse.json(
      { error: "A valid employee id is required." },
      { status: 400 },
    );
  }

  const accessRows = mapAccessPayload(body?.access, userId, roleCheck.user.id);

  const admin = createAdminClient();
  const { error: deleteError } = await admin
    .from("employee_page_access")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    logPageAccessError("delete", deleteError);
    return NextResponse.json(
      { error: friendlyDatabaseError(deleteError, "Unable to save page access.") },
      { status: 500 },
    );
  }

  if (accessRows.length === 0) {
    return NextResponse.json({ access: [] });
  }

  const { data, error } = await admin
    .from("employee_page_access")
    .upsert(accessRows, { onConflict: "user_id,route_path" })
    .select(pageAccessSelect);

  if (error) {
    logPageAccessError("upsert", error);
    return NextResponse.json(
      { error: friendlyDatabaseError(error, "Unable to save page access.") },
      { status: 500 },
    );
  }

  return NextResponse.json({ access: data ?? [] });
}
