import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import {
  friendlyDatabaseError,
  isDuplicateError,
  technicalErrorMessage,
} from "@/lib/friendlyErrors";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

const openingRoles = [
  "Admin",
  "Sales Manager",
  "Sales Rep",
  "Project Engineer",
  "Site Engineer",
] as const;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const duplicateOpeningCodeMessage =
  "Opening code already exists for this project.";

type OpeningPayload = {
  id?: unknown;
  floor?: unknown;
  room?: unknown;
  openingCode?: unknown;
  width?: unknown;
  height?: unknown;
  solidPanelHeight?: unknown;
  quantity?: unknown;
  productSystem?: unknown;
  glassType?: unknown;
  aluminumColor?: unknown;
  notes?: unknown;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function requiresGlassDetails(productSystem: string | null) {
  const normalizedSystem = productSystem?.trim().toLowerCase() ?? "";
  return (
    !normalizedSystem.includes("roller") &&
    !normalizedSystem.includes("louver")
  );
}

function normalizeOpening(body: OpeningPayload) {
  const opening = {
    floor: textValue(body.floor) || null,
    room: textValue(body.room) || null,
    opening_code: textValue(body.openingCode),
    width: numberValue(body.width),
    height: numberValue(body.height),
    solid_panel_height: Math.min(
      Math.max(numberValue(body.solidPanelHeight), 0),
      numberValue(body.height),
    ),
    quantity: Math.max(1, Math.round(numberValue(body.quantity) || 1)),
    product_system: textValue(body.productSystem) || null,
    glass_type: textValue(body.glassType) || null,
    aluminum_color: textValue(body.aluminumColor) || null,
    notes: textValue(body.notes) || null,
  };
  const hasRequiredGlassDetails =
    !requiresGlassDetails(opening.product_system) ||
    Boolean(opening.glass_type && opening.aluminum_color);

  if (
    !opening.opening_code ||
    opening.width <= 0 ||
    opening.height <= 0 ||
    opening.quantity <= 0 ||
    !opening.product_system ||
    !hasRequiredGlassDetails
  ) {
    return {
      ok: false as const,
      error:
        "Opening code, width, height, quantity, and product system are required. Glass type and glass color are required for glazed systems.",
    };
  }

  return { ok: true as const, opening };
}

function jsonDatabaseError(error: unknown, fallback: string) {
  const isDuplicate = isDuplicateError(error);
  const friendlyMessage = friendlyDatabaseError(
    error,
    fallback,
    duplicateOpeningCodeMessage,
  );

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: friendlyMessage },
      { status: isDuplicate ? 409 : 500 },
    );
  }

  return NextResponse.json(
    {
      error: technicalErrorMessage(error) || friendlyMessage,
      friendlyError: friendlyMessage,
    },
    { status: isDuplicate ? 409 : 500 },
  );
}

async function requireOpeningAccess(projectId: string) {
  const roleCheck = await requireRole(openingRoles);
  if (!roleCheck.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: roleCheck.error },
        { status: roleCheck.status },
      ),
    };
  }

  if (!uuidPattern.test(projectId)) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "A valid project id is required." },
        { status: 400 },
      ),
    };
  }

  if (!hasSupabaseServiceRoleKey()) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: supabaseServiceRoleError },
        { status: 500 },
      ),
    };
  }

  const admin = createAdminClient();
  const { data: project, error } = await admin
    .from("projects")
    .select("id, sales_engineer_id, project_engineer_id, site_engineer_id")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: friendlyDatabaseError(error, "Unable to load project.") },
        { status: 500 },
      ),
    };
  }

  if (!project) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Project was not found." },
        { status: 404 },
      ),
    };
  }

  const projectRow = project as {
    sales_engineer_id: string | null;
    project_engineer_id: string | null;
    site_engineer_id: string | null;
  };
  const canAccess =
    roleCheck.role === "Admin" ||
    roleCheck.role === "Sales Manager" ||
    (roleCheck.role === "Sales Rep" &&
      projectRow.sales_engineer_id === roleCheck.user.id) ||
    (roleCheck.role === "Project Engineer" &&
      projectRow.project_engineer_id === roleCheck.user.id) ||
    (roleCheck.role === "Site Engineer" &&
      projectRow.site_engineer_id === roleCheck.user.id);

  if (!canAccess) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Assigned project access is required." },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const, admin, roleCheck };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const access = await requireOpeningAccess(projectId);
  if (!access.ok) {
    return access.response;
  }

  const body = (await request.json().catch(() => null)) as OpeningPayload | null;
  const normalized = normalizeOpening(body ?? {});
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const { data, error } = await access.admin
    .from("openings")
    .insert({
      ...normalized.opening,
      project_id: projectId,
      created_by: access.roleCheck.user.id,
    })
    .select("id")
    .single();

  if (error) {
    return jsonDatabaseError(error, "Unable to save opening.");
  }

  return NextResponse.json({ opening: data }, { status: 201 });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const access = await requireOpeningAccess(projectId);
  if (!access.ok) {
    return access.response;
  }

  const body = (await request.json().catch(() => null)) as OpeningPayload | null;
  const openingId = typeof body?.id === "string" ? body.id : "";
  if (!uuidPattern.test(openingId)) {
    return NextResponse.json(
      { error: "A valid opening id is required." },
      { status: 400 },
    );
  }

  const normalized = normalizeOpening(body ?? {});
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const { data, error } = await access.admin
    .from("openings")
    .update(normalized.opening)
    .eq("id", openingId)
    .eq("project_id", projectId)
    .select("id")
    .maybeSingle();

  if (error) {
    return jsonDatabaseError(error, "Unable to save opening.");
  }

  if (!data) {
    return NextResponse.json(
      { error: "Opening was not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ opening: data });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const access = await requireOpeningAccess(projectId);
  if (!access.ok) {
    return access.response;
  }

  const { searchParams } = new URL(request.url);
  const openingId = searchParams.get("openingId") ?? "";
  if (!uuidPattern.test(openingId)) {
    return NextResponse.json(
      { error: "A valid opening id is required." },
      { status: 400 },
    );
  }

  const { error } = await access.admin
    .from("openings")
    .delete()
    .eq("id", openingId)
    .eq("project_id", projectId);

  if (error) {
    return NextResponse.json(
      { error: friendlyDatabaseError(error, "Unable to delete opening.") },
      { status: 500 },
    );
  }

  return NextResponse.json({ deletedOpeningId: openingId });
}
