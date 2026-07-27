import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

const measurementWorkspaceRoles = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Outdoor Sales",
  "Project Engineer",
  "Site Engineer",
] as const;

type ProjectSummary = {
  id: string;
  project_number: string;
  project_name: string;
  address: string | null;
  sales_status: string | null;
  clients:
    | { client_name: string | null; mobile: string | null }
    | Array<{ client_name: string | null; mobile: string | null }>
    | null;
};

function projectClient(project: ProjectSummary) {
  return Array.isArray(project.clients) ? project.clients[0] : project.clients;
}

async function loadContext() {
  const auth = await requireRole(measurementWorkspaceRoles);
  if (!auth.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: auth.error },
        { status: auth.status },
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

  return { ok: true as const, auth, admin: createAdminClient() };
}

export async function GET() {
  const context = await loadContext();
  if (!context.ok) {
    return context.response;
  }

  let requestQuery = context.admin
    .from("measurement_requests")
    .select("*")
    .order("updated_at", { ascending: false });

  if (
    context.auth.role === "Outdoor Sales" ||
    context.auth.role === "Project Engineer" ||
    context.auth.role === "Site Engineer"
  ) {
    requestQuery = requestQuery.eq("assigned_to", context.auth.user.id);
  }

  const { data: requests, error: requestError } = await requestQuery;
  if (requestError) {
    return NextResponse.json({ error: requestError.message }, { status: 500 });
  }

  const projectIds = [...new Set((requests ?? []).map((row) => row.project_id))];
  const profileIds = [
    ...new Set(
      (requests ?? [])
        .flatMap((row) => [
          row.requested_by,
          row.return_to_user_id,
          row.assigned_to,
        ])
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [projectResult, profileResult, submissionResult, openingResult] =
    await Promise.all([
      projectIds.length
        ? context.admin
            .from("projects")
            .select(
              "id, project_number, project_name, address, sales_status, clients(client_name, mobile)",
            )
            .in("id", projectIds)
        : Promise.resolve({ data: [], error: null }),
      profileIds.length
        ? context.admin
            .from("profiles")
            .select("id, full_name, email, role")
            .in("id", profileIds)
        : Promise.resolve({ data: [], error: null }),
      (requests ?? []).length
        ? context.admin
            .from("measurement_submissions")
            .select(
              "id, measurement_request_id, version, status, submitted_at, reviewed_at, review_note",
            )
            .in(
              "measurement_request_id",
              (requests ?? []).map((row) => row.id),
            )
            .order("version", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      (requests ?? []).length
        ? context.admin
            .from("openings")
            .select("id, measurement_request_id")
            .in(
              "measurement_request_id",
              (requests ?? []).map((row) => row.id),
            )
        : Promise.resolve({ data: [], error: null }),
    ]);

  const relatedError =
    projectResult.error ||
    profileResult.error ||
    submissionResult.error ||
    openingResult.error;
  if (relatedError) {
    return NextResponse.json({ error: relatedError.message }, { status: 500 });
  }

  const projectMap = new Map(
    ((projectResult.data ?? []) as unknown as ProjectSummary[]).map((project) => [
      project.id,
      project,
    ]),
  );
  const profileMap = new Map(
    (profileResult.data ?? []).map((profile) => [profile.id, profile]),
  );
  const latestSubmissionMap = new Map<
    string,
    (typeof submissionResult.data extends Array<infer Item> ? Item : never)
  >();
  for (const submission of submissionResult.data ?? []) {
    if (!latestSubmissionMap.has(submission.measurement_request_id)) {
      latestSubmissionMap.set(submission.measurement_request_id, submission);
    }
  }
  const openingCountMap = new Map<string, number>();
  for (const opening of openingResult.data ?? []) {
    if (!opening.measurement_request_id) continue;
    openingCountMap.set(
      opening.measurement_request_id,
      (openingCountMap.get(opening.measurement_request_id) ?? 0) + 1,
    );
  }

  const queue = (requests ?? []).map((request) => {
    const project = projectMap.get(request.project_id);
    const client = project ? projectClient(project) : null;

    return {
      id: request.id,
      projectId: request.project_id,
      projectNumber: project?.project_number ?? "",
      projectName: project?.project_name ?? "Unknown project",
      address: project?.address ?? "",
      clientName: client?.client_name ?? "",
      clientMobile: client?.mobile ?? "",
      projectStatus: project?.sales_status ?? "",
      status: request.status,
      instructions: request.instructions ?? "",
      preferredAt: request.preferred_at,
      requestedAt: request.requested_at,
      updatedAt: request.updated_at,
      requestedBy: request.requested_by
        ? profileMap.get(request.requested_by) ?? null
        : null,
      assignedTo: request.assigned_to
        ? profileMap.get(request.assigned_to) ?? null
        : null,
      returnTo: request.return_to_user_id
        ? profileMap.get(request.return_to_user_id) ?? null
        : null,
      submission: latestSubmissionMap.get(request.id) ?? null,
      openingCount: openingCountMap.get(request.id) ?? 0,
    };
  });

  let availableProjects: ProjectSummary[] = [];
  let assignees: Array<{
    id: string;
    full_name: string | null;
    email: string;
    role: string;
  }> = [];

  if (
    context.auth.role === "Admin" ||
    context.auth.role === "Sales Manager" ||
    context.auth.role === "Indoor Sales"
  ) {
    const [availableProjectResult, assigneeResult] = await Promise.all([
      context.admin
        .from("projects")
        .select(
          "id, project_number, project_name, address, sales_status, clients(client_name, mobile)",
        )
        .in("sales_status", [
          "client_registered",
          "measurement_required",
          "measurement_scheduled",
          "measurement_assigned",
          "measurements_need_correction",
        ])
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(100),
      context.admin
        .from("profiles")
        .select("id, full_name, email, role")
        .eq("is_active", true)
        .neq("status", "Inactive")
        .in("role", [
          "Admin",
          "Outdoor Sales",
          "Project Engineer",
          "Site Engineer",
        ])
        .order("full_name"),
    ]);

    if (availableProjectResult.error || assigneeResult.error) {
      return NextResponse.json(
        {
          error:
            availableProjectResult.error?.message ??
            assigneeResult.error?.message,
        },
        { status: 500 },
      );
    }

    const openProjectIds = new Set(
      (requests ?? [])
        .filter((request) => !["approved", "cancelled"].includes(request.status))
        .map((request) => request.project_id),
    );
    availableProjects = (
      (availableProjectResult.data ?? []) as unknown as ProjectSummary[]
    ).filter((project) => !openProjectIds.has(project.id));
    assignees = assigneeResult.data ?? [];
  }

  return NextResponse.json({
    role: context.auth.role,
    currentUserId: context.auth.user.id,
    queue,
    availableProjects: availableProjects.map((project) => ({
      id: project.id,
      projectNumber: project.project_number,
      projectName: project.project_name,
      address: project.address ?? "",
      clientName: projectClient(project)?.client_name ?? "",
    })),
    assignees,
  });
}

export async function POST(request: Request) {
  const context = await loadContext();
  if (!context.ok) {
    return context.response;
  }

  if (
    context.auth.role !== "Admin" &&
    context.auth.role !== "Sales Manager" &&
    context.auth.role !== "Indoor Sales"
  ) {
    return NextResponse.json(
      { error: "Indoor Sales permission is required to request measurements." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        projectId?: unknown;
        assignedTo?: unknown;
        preferredAt?: unknown;
        instructions?: unknown;
      }
    | null;
  const projectId =
    typeof body?.projectId === "string" ? body.projectId.trim() : "";
  if (!projectId) {
    return NextResponse.json(
      { error: "Select a project for measurement." },
      { status: 400 },
    );
  }

  const assignedTo =
    typeof body?.assignedTo === "string" && body.assignedTo
      ? body.assignedTo
      : null;
  const preferredAt =
    typeof body?.preferredAt === "string" && body.preferredAt
      ? new Date(body.preferredAt).toISOString()
      : null;
  const instructions =
    typeof body?.instructions === "string" ? body.instructions.trim() : null;

  const { data, error } = await context.admin.rpc(
    "create_measurement_request",
    {
      target_project_id: projectId,
      target_assignee_id: assignedTo,
      target_preferred_at: preferredAt,
      request_instructions: instructions,
      actor_user_id: context.auth.user.id,
    },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ request: data }, { status: 201 });
}
