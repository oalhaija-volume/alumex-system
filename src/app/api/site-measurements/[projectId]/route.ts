import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import type { AppRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";
import { isStructuralOpeningType } from "@/lib/measurements/structuralOpenings";
import { isWorkflowStatus } from "@/lib/workflow/display";
import type { ProjectWorkflowStatus } from "@/lib/workflow/statuses";

const measurementRoles = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Outdoor Sales",
  "Project Engineer",
  "Site Engineer",
] as const;

type ProjectRow = {
  id: string;
  project_number: string;
  project_name: string;
  client_id: string | null;
  address: string | null;
  workflow_status: string | null;
  sales_status: string | null;
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
  measurement_request_id?: string | null;
  measurement_visit_id?: string | null;
  measurement_submission_id?: string | null;
  measurement_version?: number | string | null;
  notes: string | null;
  created_at: string;
};

type MeasurementRequestRow = {
  id: string;
  project_id: string;
  assigned_to: string | null;
  return_to_user_id: string | null;
  status: string;
  instructions: string | null;
  preferred_at: string | null;
  updated_at: string;
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
  const opening = {
    floor: textValue(body.floor),
    room: textValue(body.room),
    opening_code: textValue(body.openingCode),
    width: numberValue(body.width),
    height: length,
    quantity: 1,
    opening_type: openingType,
  };

  if (
    !opening.floor ||
    !opening.room ||
    !opening.opening_code ||
    opening.width <= 0 ||
    opening.height <= 0 ||
    !isStructuralOpeningType(opening.opening_type)
  ) {
    return {
      ok: false as const,
      error:
        "Floor, room, width, height, and opening type are required.",
    };
  }

  return { ok: true as const, opening };
}

function canAccessProject({
  role,
  userId,
  project,
  measurementRequest,
}: {
  role: AppRole;
  userId: string;
  project: ProjectRow;
  measurementRequest: MeasurementRequestRow | null;
}) {
  if (role === "Admin" || role === "Sales Manager" || role === "Indoor Sales") {
    return true;
  }

  if (role === "Outdoor Sales") {
    return measurementRequest?.assigned_to === userId;
  }

  if (role === "Project Engineer") {
    return (
      measurementRequest?.assigned_to === userId ||
      project.project_engineer_id === userId
    );
  }

  if (role === "Site Engineer") {
    return (
      measurementRequest?.assigned_to === userId ||
      project.site_engineer_id === userId
    );
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
      "id, project_number, project_name, client_id, address, workflow_status, sales_status, project_engineer_id, site_engineer_id, clients(client_name, mobile, email)",
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
  const { data: requestData, error: requestError } = await admin
    .from("measurement_requests")
    .select(
      "id, project_id, assigned_to, return_to_user_id, status, instructions, preferred_at, updated_at",
    )
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (requestError) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: requestError.message },
        { status: 500 },
      ),
    };
  }

  const measurementRequest =
    (requestData as MeasurementRequestRow | null) ?? null;
  if (
    !canAccessProject({
      role: authCheck.role,
      userId: authCheck.user.id,
      project,
      measurementRequest,
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

  return {
    ok: true as const,
    admin,
    authCheck,
    project,
    measurementRequest,
  };
}

function currentRequestOpenings(
  rows: OpeningRow[],
  measurementRequest: MeasurementRequestRow | null,
) {
  if (!measurementRequest) return rows;

  const requestRows = rows.filter(
    (opening) => opening.measurement_request_id === measurementRequest.id,
  );
  const activeDraftRows = requestRows.filter(
    (opening) => !opening.measurement_submission_id,
  );
  if (activeDraftRows.length) return activeDraftRows;

  const latestVersion = requestRows.reduce(
    (latest, opening) =>
      Math.max(latest, Number(opening.measurement_version) || 0),
    0,
  );
  return requestRows.filter(
    (opening) => Number(opening.measurement_version) === latestVersion,
  );
}

async function loadOpenings(
  admin: ReturnType<typeof createAdminClient>,
  projectId: string,
  measurementRequest: MeasurementRequestRow | null,
) {
  const extendedResult = await admin
    .from("openings")
    .select(
      "id, project_id, floor, room, opening_code, width, height, solid_panel_height, fixed_height, quantity, area_sqm, product_system, glass_type, aluminum_color, shape, opening_type, bottom_frame, opening_direction, glass_color, measurement_request_id, measurement_visit_id, measurement_submission_id, measurement_version, notes, created_at",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (!extendedResult.error) {
    return currentRequestOpenings(
      (extendedResult.data ?? []) as OpeningRow[],
      measurementRequest,
    ).map(mapOpening);
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

function projectResponse(
  project: ProjectRow,
  measurementRequest: MeasurementRequestRow | null,
) {
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
    salesStatus: project.sales_status ?? "",
    measurementRequest: measurementRequest
      ? {
          id: measurementRequest.id,
          status: measurementRequest.status,
          assignedTo: measurementRequest.assigned_to,
          returnTo: measurementRequest.return_to_user_id,
          instructions: measurementRequest.instructions ?? "",
          preferredAt: measurementRequest.preferred_at,
        }
      : null,
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
    const openings = await loadOpenings(
      loaded.admin,
      projectId,
      loaded.measurementRequest,
    );
    const submissionResult = loaded.measurementRequest
      ? await loaded.admin
          .from("measurement_submissions")
          .select(
            "id, version, status, submitted_at, reviewed_at, review_note",
          )
          .eq("measurement_request_id", loaded.measurementRequest.id)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null, error: null };
    if (submissionResult.error) {
      throw submissionResult.error;
    }
    return NextResponse.json({
      project: projectResponse(loaded.project, loaded.measurementRequest),
      openings,
      submission: submissionResult.data,
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

  if (
    !loaded.measurementRequest ||
    !["in_progress", "draft_saved"].includes(loaded.measurementRequest.status)
  ) {
    return NextResponse.json(
      { error: "Start the assigned measurement visit before adding openings." },
      { status: 409 },
    );
  }

  const { data: activeVisit, error: visitError } = await loaded.admin
    .from("measurement_visits")
    .select("id")
    .eq("measurement_request_id", loaded.measurementRequest.id)
    .is("completed_at", null)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (visitError || !activeVisit) {
    return NextResponse.json(
      { error: visitError?.message ?? "Start a measurement visit first." },
      { status: visitError ? 500 : 409 },
    );
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
      measurement_request_id: loaded.measurementRequest.id,
      measurement_visit_id: activeVisit.id,
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

  if (
    !loaded.measurementRequest ||
    !["in_progress", "draft_saved"].includes(loaded.measurementRequest.status)
  ) {
    return NextResponse.json(
      { error: "Only an active measurement visit can change openings." },
      { status: 409 },
    );
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
    .eq("measurement_request_id", loaded.measurementRequest.id)
    .is("measurement_submission_id", null)
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

  if (
    !loaded.measurementRequest ||
    !["in_progress", "draft_saved"].includes(loaded.measurementRequest.status)
  ) {
    return NextResponse.json(
      { error: "Only an active measurement visit can remove openings." },
      { status: 409 },
    );
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
    .eq("project_id", projectId)
    .eq("measurement_request_id", loaded.measurementRequest.id)
    .is("measurement_submission_id", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deletedOpeningId: openingId });
}
