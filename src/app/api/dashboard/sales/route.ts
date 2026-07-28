import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import {
  friendlyDatabaseError,
  isMissingDatabaseObjectError,
} from "@/lib/friendlyErrors";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";
import { normalizeDashboardPreviewRole } from "@/lib/dashboard/salesDashboard";

const dashboardRoles = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Outdoor Sales",
  "Sales Rep",
  "Branch Manager",
] as const;

type ProjectRow = Pick<
  Database["public"]["Tables"]["projects"]["Row"],
  | "id"
  | "project_number"
  | "project_name"
  | "client_id"
  | "address"
  | "location_latitude"
  | "location_longitude"
  | "original_creator_id"
  | "owner_id"
  | "responsible_user_id"
  | "sales_status"
  | "structure_readiness"
  | "expected_structure_ready_date"
  | "next_follow_up_at"
  | "priority"
  | "updated_at"
>;

const projectSelect =
  "id, project_number, project_name, client_id, address, location_latitude, location_longitude, original_creator_id, owner_id, responsible_user_id, sales_status, structure_readiness, expected_structure_ready_date, next_follow_up_at, priority, updated_at";

async function loadContext() {
  const auth = await requireRole(dashboardRoles);
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

export async function GET(request: Request) {
  const context = await loadContext();
  if (!context.ok) return context.response;

  const requestedPreviewRole = normalizeDashboardPreviewRole(
    new URL(request.url).searchParams.get("viewAs"),
  );
  const effectiveRole =
    context.auth.role === "Admin" && requestedPreviewRole
      ? requestedPreviewRole
      : context.auth.role;
  const isOutdoor = effectiveRole === "Outdoor Sales";
  const isManager =
    effectiveRole === "Admin" || effectiveRole === "Sales Manager";

  let projectQuery = context.admin
    .from("projects")
    .select(projectSelect)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(300);
  if (isOutdoor) {
    projectQuery = projectQuery.or(
      [
        `original_creator_id.eq.${context.auth.user.id}`,
        `sales_engineer_id.eq.${context.auth.user.id}`,
        `responsible_user_id.eq.${context.auth.user.id}`,
      ].join(","),
    );
  }

  let measurementQuery = context.admin
    .from("measurement_requests")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (isOutdoor) {
    measurementQuery = measurementQuery.eq(
      "assigned_to",
      context.auth.user.id,
    );
  }

  let appointmentQuery = context.admin
    .from("appointments")
    .select("*")
    .order("starts_at", { ascending: true })
    .limit(300);
  if (isOutdoor) {
    appointmentQuery = appointmentQuery.eq(
      "assigned_employee_id",
      context.auth.user.id,
    );
  }

  const [
    projectResult,
    measurementResult,
    appointmentResult,
    taskResult,
    profileResult,
    auditResult,
  ] = await Promise.all([
    projectQuery,
    measurementQuery,
    appointmentQuery,
    isOutdoor
      ? Promise.resolve({ data: [], error: null })
      : context.admin
          .from("follow_up_tasks")
          .select("*")
          .order("due_at", { ascending: true })
          .limit(400),
    context.admin
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("is_active", true)
      .neq("status", "Inactive")
      .in("role", [
        "Admin",
        "Sales Manager",
        "Indoor Sales",
        "Outdoor Sales",
        "Sales Rep",
        "Branch Manager",
      ])
      .order("full_name"),
    isManager
      ? context.admin
          .from("audit_events")
          .select(
            "id, actor_id, actor_role, action, entity_type, entity_id, reason, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const firstError =
    projectResult.error ??
    measurementResult.error ??
    appointmentResult.error ??
    taskResult.error ??
    profileResult.error ??
    auditResult.error;
  if (firstError) {
    if (isMissingDatabaseObjectError(firstError)) {
      return NextResponse.json({
        role: effectiveRole,
        currentUserId: context.auth.user.id,
        projects: [],
        followUps: [],
        measurements: [],
        appointments: [],
        profiles: profileResult.data ?? [],
        auditEvents: [],
        setupRequired: true,
      });
    }

    return NextResponse.json(
      { error: friendlyDatabaseError(firstError, "Unable to load dashboard.") },
      { status: 500 },
    );
  }

  const projectMap = new Map(
    ((projectResult.data ?? []) as ProjectRow[]).map((project) => [
      project.id,
      project,
    ]),
  );
  const relatedProjectIds = new Set([
    ...(measurementResult.data ?? []).map((request) => request.project_id),
    ...(appointmentResult.data ?? []).map(
      (appointment) => appointment.project_id,
    ),
    ...(taskResult.data ?? []).map((task) => task.project_id),
  ]);
  const missingProjectIds = [...relatedProjectIds].filter(
    (projectId) => !projectMap.has(projectId),
  );

  if (missingProjectIds.length) {
    const { data, error } = await context.admin
      .from("projects")
      .select(projectSelect)
      .in("id", missingProjectIds);
    if (error) {
      return NextResponse.json(
        { error: friendlyDatabaseError(error, "Unable to load projects.") },
        { status: 500 },
      );
    }
    for (const project of (data ?? []) as ProjectRow[]) {
      projectMap.set(project.id, project);
    }
  }

  const clientIds = [...new Set([...projectMap.values()].map((row) => row.client_id))];
  const { data: clients, error: clientError } = clientIds.length
    ? await context.admin
        .from("clients")
        .select("id, client_name, mobile, whatsapp")
        .in("id", clientIds)
    : { data: [], error: null };
  if (clientError) {
    return NextResponse.json(
      { error: friendlyDatabaseError(clientError, "Unable to load clients.") },
      { status: 500 },
    );
  }

  const clientMap = new Map(
    (clients ?? []).map((client) => [client.id, client]),
  );
  const profileMap = new Map(
    (profileResult.data ?? []).map((profile) => [profile.id, profile]),
  );
  const enrichedProjects = [...projectMap.values()].map((project) => ({
    ...project,
    isMine:
      project.owner_id === context.auth.user.id ||
      project.responsible_user_id === context.auth.user.id ||
      project.original_creator_id === context.auth.user.id,
    client: clientMap.get(project.client_id) ?? null,
    owner: project.owner_id ? profileMap.get(project.owner_id) ?? null : null,
    responsible: project.responsible_user_id
      ? profileMap.get(project.responsible_user_id) ?? null
      : null,
  }));

  return NextResponse.json({
    role: effectiveRole,
    currentUserId: context.auth.user.id,
    projects: enrichedProjects,
    followUps: (taskResult.data ?? []).map((task) => ({
      ...task,
      isMine:
        task.owner_id === context.auth.user.id ||
        task.assigned_to === context.auth.user.id,
      project: projectMap.get(task.project_id) ?? null,
      client: clientMap.get(task.client_id) ?? null,
      owner: task.owner_id ? profileMap.get(task.owner_id) ?? null : null,
      assignee: task.assigned_to
        ? profileMap.get(task.assigned_to) ?? null
        : null,
    })),
    measurements: (measurementResult.data ?? []).map((request) => ({
      ...request,
      project: projectMap.get(request.project_id) ?? null,
      client: projectMap.get(request.project_id)
        ? clientMap.get(projectMap.get(request.project_id)!.client_id) ?? null
        : null,
      assignee: request.assigned_to
        ? profileMap.get(request.assigned_to) ?? null
        : null,
    })),
    appointments: (appointmentResult.data ?? []).map((appointment) => ({
      ...appointment,
      project: projectMap.get(appointment.project_id) ?? null,
      client: clientMap.get(appointment.client_id) ?? null,
      assignee: appointment.assigned_employee_id
        ? profileMap.get(appointment.assigned_employee_id) ?? null
        : null,
    })),
    profiles: profileResult.data ?? [],
    auditEvents: (auditResult.data ?? []).map((event) => ({
      ...event,
      actor: event.actor_id ? profileMap.get(event.actor_id) ?? null : null,
    })),
  });
}

export async function PATCH(request: Request) {
  const context = await loadContext();
  if (!context.ok) return context.response;

  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    appointmentId?: unknown;
    status?: unknown;
    note?: unknown;
  } | null;

  if (body?.action !== "update_appointment") {
    return NextResponse.json(
      { error: "Select a valid dashboard action." },
      { status: 400 },
    );
  }

  const appointmentId =
    typeof body.appointmentId === "string" ? body.appointmentId : "";
  const status = typeof body.status === "string" ? body.status : "";
  const note = typeof body.note === "string" ? body.note.trim() : null;
  if (!appointmentId || !status) {
    return NextResponse.json(
      { error: "Appointment and status are required." },
      { status: 400 },
    );
  }

  const { data, error } = await context.admin.rpc(
    "update_sales_appointment_status",
    {
      target_appointment_id: appointmentId,
      target_status: status,
      completion_note: note,
      actor_user_id: context.auth.user.id,
    },
  );
  if (error) {
    return NextResponse.json(
      {
        error: friendlyDatabaseError(
          error,
          "Unable to update the appointment.",
        ),
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ appointment: data });
}
