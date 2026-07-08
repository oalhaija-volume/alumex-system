import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import type { AppRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";
import { isWorkflowStatus } from "@/lib/workflow/display";
import type { ProjectWorkflowStatus } from "@/lib/workflow/statuses";

const measurementRoles = ["Admin", "Project Engineer", "Site Engineer"] as const;

type ProjectRow = {
  id: string;
  project_number: string;
  project_name: string;
  client_id: string | null;
  address: string | null;
  workflow_status: string | null;
  project_engineer_id: string | null;
  site_engineer_id: string | null;
  clients:
    | {
        client_name: string | null;
        mobile: string | null;
        email: string | null;
      }
    | Array<{
        client_name: string | null;
        mobile: string | null;
        email: string | null;
      }>
    | null;
};

type OpeningRow = {
  id: string;
  project_id: string;
  floor: string | null;
  room: string | null;
  opening_code: string;
  width: number | string;
  height: number | string;
  solid_panel_height?: number | string | null;
  fixed_height?: number | string | null;
  quantity: number | string;
  area_sqm?: number | string | null;
  product_system: string | null;
  glass_type: string | null;
  aluminum_color: string | null;
  shape?: string | null;
  opening_type?: string | null;
  bottom_frame?: string | null;
  opening_direction?: string | null;
  glass_color?: string | null;
  notes: string | null;
  created_at: string;
};

type OpeningPayload = {
  id?: unknown;
  floor?: unknown;
  room?: unknown;
  openingCode?: unknown;
  width?: unknown;
  height?: unknown;
  length?: unknown;
  solidPanelHeight?: unknown;
  fixedHeight?: unknown;
  quantity?: unknown;
  productSystem?: unknown;
  glassType?: unknown;
  aluminumColor?: unknown;
  shape?: unknown;
  type?: unknown;
  openingType?: unknown;
  bottomFrame?: unknown;
  openingDirection?: unknown;
  glassColor?: unknown;
  notes?: unknown;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clientFromProject(project: ProjectRow) {
  return Array.isArray(project.clients) ? project.clients[0] : project.clients;
}

function mapOpening(opening: OpeningRow) {
  return {
    id: opening.id,
    floor: opening.floor ?? "",
    room: opening.room ?? "",
    openingCode: opening.opening_code,
    width: Number(opening.width) || 0,
    height: Number(opening.height) || 0,
    length: Number(opening.height) || 0,
    solidPanelHeight: Number(opening.solid_panel_height) || 0,
    fixedHeight: Number(opening.fixed_height) || 0,
    quantity: Number(opening.quantity) || 1,
    areaSqm: Number(opening.area_sqm) || 0,
    productSystem: opening.product_system ?? "",
    glassType: opening.glass_type ?? "",
    aluminumColor: opening.aluminum_color ?? "",
    shape: opening.shape ?? "",
    type: opening.opening_type ?? opening.product_system ?? "",
    openingType: opening.opening_type ?? opening.product_system ?? "",
    bottomFrame: opening.bottom_frame ?? "",
    openingDirection: opening.opening_direction ?? "",
    glassColor: opening.glass_color ?? opening.aluminum_color ?? "",
    notes: opening.notes ?? "",
  };
}

function normalizeOpeningPayload(body: OpeningPayload) {
  const length = numberValue(body.length ?? body.height);
  const openingType = textValue(body.openingType ?? body.type);
  const glassColor = textValue(body.glassColor ?? body.aluminumColor);
  const opening = {
    floor: textValue(body.floor),
    room: textValue(body.room),
    opening_code: textValue(body.openingCode),
    width: numberValue(body.width),
    height: length,
    solid_panel_height: Math.min(
      Math.max(numberValue(body.solidPanelHeight), 0),
      length,
    ),
    fixed_height: Math.min(Math.max(numberValue(body.fixedHeight), 0), length),
    quantity: Math.max(1, Math.round(numberValue(body.quantity) || 1)),
    product_system: textValue(body.productSystem) || openingType,
    glass_type: textValue(body.glassType) || openingType,
    aluminum_color: textValue(body.aluminumColor) || glassColor,
    shape: textValue(body.shape),
    opening_type: openingType,
    bottom_frame: textValue(body.bottomFrame),
    opening_direction: textValue(body.openingDirection),
    glass_color: glassColor,
    notes: textValue(body.notes),
  };

  if (
    !opening.floor ||
    !opening.room ||
    !opening.opening_code ||
    opening.width <= 0 ||
    opening.height <= 0 ||
    !opening.shape ||
    !opening.opening_type ||
    !opening.bottom_frame ||
    !opening.opening_direction ||
    !opening.glass_color
  ) {
    return {
      ok: false as const,
      error:
        "Floor, room, opening code, width, length, shape, type, bottom frame, opening direction, and glass color are required.",
    };
  }

  return { ok: true as const, opening };
}

function canAccessProject({
  role,
  userId,
  project,
}: {
  role: AppRole;
  userId: string;
  project: ProjectRow;
}) {
  if (role === "Admin") {
    return true;
  }

  if (role === "Project Engineer") {
    return project.project_engineer_id === userId;
  }

  if (role === "Site Engineer") {
    return project.site_engineer_id === userId;
  }

  return false;
}

async function loadProjectForUser(projectId: string) {
  const authCheck = await requireRole(measurementRoles);
  if (!authCheck.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: authCheck.error },
        { status: authCheck.status },
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
  const { data, error } = await admin
    .from("projects")
    .select(
      "id, project_number, project_name, client_id, address, workflow_status, project_engineer_id, site_engineer_id, clients(client_name, mobile, email)",
    )
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: error.message }, { status: 500 }),
    };
  }

  if (!data) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Project was not found." },
        { status: 404 },
      ),
    };
  }

  const project = data as ProjectRow;
  if (
    !canAccessProject({
      role: authCheck.role,
      userId: authCheck.user.id,
      project,
    })
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Assigned project engineer or site engineer access is required." },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const, admin, authCheck, project };
}

async function loadOpenings(admin: ReturnType<typeof createAdminClient>, projectId: string) {
  const extendedResult = await admin
    .from("openings")
    .select(
      "id, project_id, floor, room, opening_code, width, height, solid_panel_height, fixed_height, quantity, area_sqm, product_system, glass_type, aluminum_color, shape, opening_type, bottom_frame, opening_direction, glass_color, notes, created_at",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (!extendedResult.error) {
    return ((extendedResult.data ?? []) as OpeningRow[]).map(mapOpening);
  }

  const message = extendedResult.error.message?.toLowerCase() ?? "";
  if (
    !message.includes("fixed_height") &&
    !message.includes("shape") &&
    !message.includes("opening_type") &&
    !message.includes("bottom_frame") &&
    !message.includes("opening_direction") &&
    !message.includes("glass_color") &&
    !message.includes("schema cache")
  ) {
    throw extendedResult.error;
  }

  console.warn(
    "[api/site-measurements] site engineer opening detail columns are missing; using legacy openings fallback",
    extendedResult.error,
  );

  const { data, error } = await admin
    .from("openings")
    .select(
      "id, project_id, floor, room, opening_code, width, height, solid_panel_height, quantity, area_sqm, product_system, glass_type, aluminum_color, notes, created_at",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data ?? []) as OpeningRow[]).map(mapOpening);
}

function projectResponse(project: ProjectRow) {
  const client = clientFromProject(project);
  const workflowStatus: ProjectWorkflowStatus = isWorkflowStatus(project.workflow_status)
    ? project.workflow_status
    : "sales_client_created";

  return {
    id: project.id,
    projectNumber: project.project_number,
    projectName: project.project_name,
    address: project.address ?? "",
    workflowStatus,
    client: {
      id: project.client_id ?? "",
      name: client?.client_name ?? "",
      mobile: client?.mobile ?? "",
      email: client?.email ?? "",
    },
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const loaded = await loadProjectForUser(projectId);
  if (!loaded.ok) {
    return loaded.response;
  }

  try {
    const openings = await loadOpenings(loaded.admin, projectId);
    return NextResponse.json({
      project: projectResponse(loaded.project),
      openings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load site measurements.",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const loaded = await loadProjectForUser(projectId);
  if (!loaded.ok) {
    return loaded.response;
  }

  const body = (await request.json().catch(() => null)) as OpeningPayload | null;
  const normalized = normalizeOpeningPayload(body ?? {});
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const { data, error } = await loaded.admin
    .from("openings")
    .insert({
      ...normalized.opening,
      project_id: projectId,
      created_by: loaded.authCheck.user.id,
    })
    .select(
      "id, project_id, floor, room, opening_code, width, height, solid_panel_height, fixed_height, quantity, area_sqm, product_system, glass_type, aluminum_color, shape, opening_type, bottom_frame, opening_direction, glass_color, notes, created_at",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ opening: mapOpening(data as OpeningRow) });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const loaded = await loadProjectForUser(projectId);
  if (!loaded.ok) {
    return loaded.response;
  }

  const body = (await request.json().catch(() => null)) as OpeningPayload | null;
  const openingId = typeof body?.id === "string" ? body.id : "";
  if (!openingId) {
    return NextResponse.json({ error: "Opening id is required." }, { status: 400 });
  }

  const normalized = normalizeOpeningPayload(body ?? {});
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const { data, error } = await loaded.admin
    .from("openings")
    .update(normalized.opening)
    .eq("id", openingId)
    .eq("project_id", projectId)
    .select(
      "id, project_id, floor, room, opening_code, width, height, solid_panel_height, fixed_height, quantity, area_sqm, product_system, glass_type, aluminum_color, shape, opening_type, bottom_frame, opening_direction, glass_color, notes, created_at",
    )
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { error: "Opening was not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ opening: mapOpening(data as OpeningRow) });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const loaded = await loadProjectForUser(projectId);
  if (!loaded.ok) {
    return loaded.response;
  }

  const { searchParams } = new URL(request.url);
  const openingId = searchParams.get("openingId") ?? "";
  if (!openingId) {
    return NextResponse.json({ error: "Opening id is required." }, { status: 400 });
  }

  const { error } = await loaded.admin
    .from("openings")
    .delete()
    .eq("id", openingId)
    .eq("project_id", projectId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deletedOpeningId: openingId });
}
