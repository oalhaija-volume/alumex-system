import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";
import {
  friendlyDatabaseError,
  isDuplicateError,
  technicalErrorMessage,
} from "@/lib/friendlyErrors";
import { generateNextProjectNumber } from "@/lib/projects/numbering";
import { loadOutdoorSalesProjectIds } from "@/lib/projects/access";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const projectReadRoles = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Outdoor Sales",
  "Sales Rep",
  "Branch Manager",
] as const;
const projectWriteRoles = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Outdoor Sales",
  "Sales Rep",
  "Branch Manager",
] as const;
const fullProjectSelect =
  "id, project_number, project_name, client_id, address, location_latitude, location_longitude, geofence_radius_meters, project_type, branch, sales_engineer_id, status, clients(client_name)";
const baseProjectSelect =
  "id, project_number, project_name, client_id, address, project_type, sales_engineer_id, status, clients(client_name)";
const projectSelectWithoutClient =
  "id, project_number, project_name, client_id, address, project_type, sales_engineer_id, status";
const fullOpeningSelect =
  "id, project_id, floor, room, opening_code, width, height, solid_panel_height, quantity, product_system, glass_type, aluminum_color, notes";
const baseOpeningSelect =
  "id, project_id, floor, room, opening_code, width, height, quantity, product_system, glass_type, aluminum_color, notes";

async function loadProjectNumbers(admin: ReturnType<typeof createAdminClient>) {
  const date = new Date();
  const prefix = `PRJ-${date.getFullYear()}${(date.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-`;
  const { data, error } = await admin
    .from("projects")
    .select("project_number")
    .like("project_number", `${prefix}%`);

  if (error) {
    throw error;
  }

  return ((data ?? []) as Array<{ project_number: string | null }>)
    .map((project) => project.project_number)
    .filter((projectNumber): projectNumber is string => Boolean(projectNumber));
}

function jsonDatabaseError(error: unknown, fallback: string, status = 500) {
  const message = friendlyDatabaseError(error, fallback);

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(
    {
      error: technicalErrorMessage(error) || message,
      friendlyError: message,
    },
    { status },
  );
}

async function loadProjects(admin: ReturnType<typeof createAdminClient>) {
  const fullResult = await admin
    .from("projects")
    .select(fullProjectSelect)
    .order("created_at", { ascending: false });

  if (!fullResult.error) {
    return { projects: fullResult.data ?? [], warning: null };
  }

  console.error("[api/projects] full project select failed", {
    route: "/api/projects",
    operation: "select-projects-full",
    table: "public.projects",
    client: "createAdminClient",
    executingRole: "service_role",
    error: fullResult.error,
  });

  const baseResult = await admin
    .from("projects")
    .select(baseProjectSelect)
    .order("created_at", { ascending: false });

  if (!baseResult.error) {
    return {
      projects: (baseResult.data ?? []).map((project) => ({
        ...project,
        location_latitude: null,
        location_longitude: null,
        geofence_radius_meters: 100,
      })),
      warning: fullResult.error,
    };
  }

  console.error("[api/projects] base project select failed", {
    route: "/api/projects",
    operation: "select-projects-base",
    table: "public.projects",
    client: "createAdminClient",
    executingRole: "service_role",
    error: baseResult.error,
  });

  const plainResult = await admin
    .from("projects")
    .select(projectSelectWithoutClient)
    .order("created_at", { ascending: false });

  if (!plainResult.error) {
    return {
      projects: (plainResult.data ?? []).map((project) => ({
        ...project,
        clients: null,
        location_latitude: null,
        location_longitude: null,
        geofence_radius_meters: 100,
      })),
      warning: baseResult.error,
    };
  }

  throw plainResult.error;
}

async function loadOpenings(admin: ReturnType<typeof createAdminClient>) {
  const fullResult = await admin.from("openings").select(fullOpeningSelect);

  if (!fullResult.error) {
    return { openings: fullResult.data ?? [], warning: null };
  }

  console.error("[api/projects] full openings select failed", {
    route: "/api/projects",
    operation: "select-openings-full",
    table: "public.openings",
    client: "createAdminClient",
    executingRole: "service_role",
    error: fullResult.error,
  });

  const baseResult = await admin.from("openings").select(baseOpeningSelect);

  if (!baseResult.error) {
    return {
      openings: (baseResult.data ?? []).map((opening) => ({
        ...opening,
        solid_panel_height: 0,
      })),
      warning: fullResult.error,
    };
  }

  console.error("[api/projects] base openings select failed", {
    route: "/api/projects",
    operation: "select-openings-base",
    table: "public.openings",
    client: "createAdminClient",
    executingRole: "service_role",
    error: baseResult.error,
  });

  return { openings: [], warning: baseResult.error };
}

export async function GET() {
  const authCheck = await requireRole(projectReadRoles);

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: supabaseServiceRoleError },
      { status: 500 },
    );
  }

  try {
    const admin = createAdminClient();
    const [
      { projects, warning: projectsWarning },
      { openings, warning: openingsWarning },
      profilesResult,
    ] = await Promise.all([
      loadProjects(admin),
      loadOpenings(admin),
      admin.from("profiles").select("id, full_name, email"),
    ]);

    if (profilesResult.error) {
      throw profilesResult.error;
    }

    const outdoorScope =
      authCheck.role === "Outdoor Sales"
        ? await loadOutdoorSalesProjectIds(authCheck.user.id)
        : null;

    if (outdoorScope?.error) {
      throw outdoorScope.error;
    }

    const salesNames = new Map(
      (profilesResult.data ?? []).map((profile) => [
        profile.id,
        profile.full_name?.trim() || profile.email || "",
      ]),
    );
    const visibleProjects =
      outdoorScope
        ? projects.filter(
            (project) => outdoorScope.ids.has(project.id),
          )
        : projects;
    const visibleProjectIds = new Set(
      visibleProjects.map((project) => project.id),
    );
    const visibleOpenings =
      authCheck.role === "Outdoor Sales"
        ? openings.filter((opening) => visibleProjectIds.has(opening.project_id))
        : openings;
    const projectsWithSalesOwners = visibleProjects.map((project) => ({
      ...project,
      branch: "branch" in project ? project.branch : null,
      sales_engineer_name:
        salesNames.get(
          typeof project.sales_engineer_id === "string"
            ? project.sales_engineer_id
            : "",
        ) ?? "",
    }));

    return NextResponse.json({
      projects: projectsWithSalesOwners,
      openings: visibleOpenings,
      warning:
        technicalErrorMessage(projectsWarning) ||
        technicalErrorMessage(openingsWarning) ||
        undefined,
    });
  } catch (projectsError) {
    console.error("[api/projects] load projects failed", {
      route: "/api/projects",
      operation: "select-projects",
      table: "public.projects",
      client: "createAdminClient",
      executingRole: "service_role",
      error: projectsError,
    });

    return jsonDatabaseError(projectsError, "Unable to load projects.");
  }
}

export async function POST(request: Request) {
  const authCheck = await requireRole(projectWriteRoles);

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: supabaseServiceRoleError },
      { status: 500 },
    );
  }

  const user = authCheck.user;
  const body = await request.json();

  const {
    project_name,
    client_id,
    address,
    project_type,
    status,
    location_latitude,
    location_longitude,
    geofence_radius_meters,
    branch,
  } = body;

  if (
    !project_name ||
    !client_id ||
    (branch !== "Rasafa" && branch !== "Karkh")
  ) {
    return NextResponse.json(
      { error: "Project name, client, and branch are required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const collidedProjectNumbers = new Set<string>();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    let projectNumber: string;

    try {
      projectNumber = generateNextProjectNumber({
        projectNumbers: await loadProjectNumbers(admin),
        reservedNumbers: Array.from(collidedProjectNumbers),
      });
    } catch (numberError) {
      console.error("[api/projects] number generation failed", {
        route: "/api/projects",
        operation: "next-project-number",
        table: "public.projects",
        error: numberError,
      });

      return NextResponse.json(
        { error: friendlyDatabaseError(numberError, "Unable to generate project number.") },
        { status: 500 },
      );
    }

    const { data, error } = await admin
      .from("projects")
      .insert([
        {
          project_number: projectNumber,
          project_name,
          client_id,
          address: address || null,
          project_type: project_type || null,
          branch,
          sales_engineer_id: user.id,
          status: status || "Draft",
          location_latitude: location_latitude ?? null,
          location_longitude: location_longitude ?? null,
          geofence_radius_meters: geofence_radius_meters ?? 100,
          created_by: user.id,
        },
      ])
      .select()
      .single();

    if (!error) {
      return NextResponse.json(data, { status: 201 });
    }

    if (isDuplicateError(error)) {
      collidedProjectNumbers.add(projectNumber);
      continue;
    }

    console.error("[api/projects] create failed", {
      route: "/api/projects",
      operation: "insert-project",
      table: "public.projects",
      error,
    });

    return NextResponse.json(
      { error: friendlyDatabaseError(error, "Unable to save project.") },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { error: "Unable to generate a unique project number." },
    { status: 500 },
  );
}

export async function PATCH(request: Request) {
  const authCheck = await requireRole(projectWriteRoles);

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: supabaseServiceRoleError },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body.id !== "string" || !uuidPattern.test(body.id)) {
    return NextResponse.json(
      { error: "A valid project id is required." },
      { status: 400 },
    );
  }

  const {
    project_name,
    client_id,
    address,
    project_type,
    status,
    location_latitude,
    location_longitude,
    geofence_radius_meters,
    branch,
  } = body;

  if (
    !project_name ||
    !client_id ||
    (branch !== "Rasafa" && branch !== "Karkh")
  ) {
    return NextResponse.json(
      { error: "Project name, client, and branch are required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  if (authCheck.role === "Outdoor Sales") {
    const access = await loadOutdoorSalesProjectIds(authCheck.user.id);

    if (access.error) {
      return jsonDatabaseError(
        access.error,
        "Unable to verify project access.",
      );
    }

    if (!access.ids.has(body.id)) {
      return NextResponse.json(
        { error: "Assigned project access is required." },
        { status: 403 },
      );
    }
  }

  const { data, error } = await admin
    .from("projects")
    .update({
      project_name,
      client_id,
      address: address || null,
      project_type: project_type || null,
      branch,
      status: status || "Draft",
      location_latitude: location_latitude ?? null,
      location_longitude: location_longitude ?? null,
      geofence_radius_meters: geofence_radius_meters ?? 100,
    })
    .eq("id", body.id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[api/projects] update failed", {
      route: "/api/projects",
      operation: "update-project",
      table: "public.projects",
      error,
    });

    return NextResponse.json(
      { error: friendlyDatabaseError(error, "Unable to save project.") },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Project was not found." },
      { status: 404 },
    );
  }

  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const authCheck = await requireRole(["Admin"]);

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: supabaseServiceRoleError },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    projectIds?: unknown;
  } | null;
  const projectIds = Array.isArray(body?.projectIds)
    ? body.projectIds.filter(
        (projectId): projectId is string =>
          typeof projectId === "string" && uuidPattern.test(projectId),
      )
    : [];

  if (projectIds.length === 0) {
    return NextResponse.json(
      { error: "At least one database project id is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: quotations, error: quotationsError } = await admin
    .from("quotations")
    .select("id")
    .in("project_id", projectIds);

  if (quotationsError) {
    console.error("[api/projects] quotation lookup failed", {
      route: "/api/projects",
      operation: "select-project-quotations",
      table: "public.quotations",
      client: "createAdminClient",
      executingRole: "service_role",
      error: quotationsError,
    });

    return NextResponse.json(
      { error: friendlyDatabaseError(quotationsError, "Unable to prepare project deletion.") },
      { status: 500 },
    );
  }

  const quotationIds = (quotations ?? []).map(
    (quotation: { id: string }) => quotation.id,
  );

  if (quotationIds.length > 0) {
    const { error: quotationItemsError } = await admin
      .from("quotation_items")
      .delete()
      .in("quotation_id", quotationIds);

    if (quotationItemsError) {
      console.error("[api/projects] quotation items cleanup failed", {
        route: "/api/projects",
        operation: "delete-quotation-items",
        table: "public.quotation_items",
        client: "createAdminClient",
        executingRole: "service_role",
        error: quotationItemsError,
      });

      return NextResponse.json(
        { error: friendlyDatabaseError(quotationItemsError, "Unable to delete project quotations.") },
        { status: 500 },
      );
    }
  }

  const { error: documentsError } = await admin
    .from("documents")
    .delete()
    .in("project_id", projectIds);

  if (documentsError) {
    console.error("[api/projects] project documents cleanup failed", {
      route: "/api/projects",
      operation: "delete-project-documents",
      table: "public.documents",
      client: "createAdminClient",
      executingRole: "service_role",
      error: documentsError,
    });

    return NextResponse.json(
      { error: friendlyDatabaseError(documentsError, "Unable to delete project documents.") },
      { status: 500 },
    );
  }

  const deleteSteps = [
    {
      table: "public.contracts",
      operation: "delete-contracts",
      query: admin.from("contracts").delete().in("project_id", projectIds),
    },
    {
      table: "public.quotations",
      operation: "delete-quotations",
      query: admin.from("quotations").delete().in("project_id", projectIds),
    },
    {
      table: "public.openings",
      operation: "delete-openings",
      query: admin.from("openings").delete().in("project_id", projectIds),
    },
  ];

  for (const deleteStep of deleteSteps) {
    const { error } = await deleteStep.query;

    if (error) {
      console.error("[api/projects] cascading delete failed", {
        route: "/api/projects",
        operation: deleteStep.operation,
        table: deleteStep.table,
        client: "createAdminClient",
        executingRole: "service_role",
        error,
      });

      return NextResponse.json(
        { error: friendlyDatabaseError(error, "Unable to delete project.") },
        { status: 500 },
      );
    }
  }

  const { data: deletedProjects, error: projectsDeleteError } = await admin
    .from("projects")
    .delete()
    .in("id", projectIds)
    .select("id");

  if (projectsDeleteError) {
    console.error("[api/projects] project delete failed", {
      route: "/api/projects",
      operation: "delete-projects",
      table: "public.projects",
      client: "createAdminClient",
      executingRole: "service_role",
      error: projectsDeleteError,
    });

    return NextResponse.json(
      { error: friendlyDatabaseError(projectsDeleteError, "Unable to delete project.") },
      { status: 500 },
    );
  }

  if ((deletedProjects ?? []).length !== projectIds.length) {
    return NextResponse.json(
      { error: "Project was not deleted. It may already have been removed." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, deletedProjectIds: deletedProjects });
}
