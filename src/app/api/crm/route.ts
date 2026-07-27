import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";

const crmRoles = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Branch Manager",
] as const;

type TaskRow = Database["public"]["Tables"]["follow_up_tasks"]["Row"];
type ActivityRow =
  Database["public"]["Tables"]["follow_up_activities"]["Row"];

async function loadContext() {
  const auth = await requireRole(crmRoles);
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

  const projectId = new URL(request.url).searchParams.get("projectId");
  let taskQuery = context.admin
    .from("follow_up_tasks")
    .select("*")
    .order("due_at", { ascending: true })
    .limit(300);
  if (projectId) taskQuery = taskQuery.eq("project_id", projectId);

  const { data: taskData, error: taskError } = await taskQuery;
  if (taskError) {
    return NextResponse.json({ error: taskError.message }, { status: 500 });
  }
  const tasks = (taskData ?? []) as TaskRow[];
  const overdueTasks = tasks.filter(
    (task) =>
      task.status === "open" &&
      (task.assigned_to === context.auth.user.id ||
        task.owner_id === context.auth.user.id) &&
      Date.parse(task.due_at) < Date.now(),
  );
  await Promise.all(
    overdueTasks.map(async (task) => {
      const { error } = await context.admin.from("notifications").insert({
        recipient_id: context.auth.user.id,
        notification_kind: "overdue",
        event_type: "follow_up_overdue",
        entity_type: "follow_up_task",
        entity_id: task.id,
        title_key: "crm.notifications.followUpOverdue",
        message_key: "crm.notifications.followUpOverdueMessage",
        link_path: `/crm?taskId=${task.id}`,
        payload: {
          project_id: task.project_id,
          due_at: task.due_at,
          task_type: task.task_type,
        },
        deduplication_key: `follow-up-overdue:${task.id}`,
      });
      if (error && error.code !== "23505") {
        console.error("[crm] unable to materialize overdue notification", error);
      }
    }),
  );
  const taskIds = tasks.map((task) => task.id);
  const projectIds = [...new Set(tasks.map((task) => task.project_id))];
  const clientIds = [...new Set(tasks.map((task) => task.client_id))];
  const profileIds = [
    ...new Set(
      tasks
        .flatMap((task) => [
          task.owner_id,
          task.assigned_to,
          task.completed_by,
        ])
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [projectsResult, clientsResult, profilesResult, activitiesResult, notificationsResult] =
    await Promise.all([
      projectIds.length
        ? context.admin
            .from("projects")
            .select(
              "id, project_number, project_name, address, sales_status, priority, next_follow_up_at, owner_id, responsible_user_id",
            )
            .in("id", projectIds)
        : Promise.resolve({ data: [], error: null }),
      clientIds.length
        ? context.admin
            .from("clients")
            .select("id, client_name, mobile, whatsapp, email")
            .in("id", clientIds)
        : Promise.resolve({ data: [], error: null }),
      profileIds.length
        ? context.admin
            .from("profiles")
            .select("id, full_name, email, role")
            .in("id", profileIds)
        : Promise.resolve({ data: [], error: null }),
      taskIds.length
        ? context.admin
            .from("follow_up_activities")
            .select("*")
            .in("follow_up_task_id", taskIds)
            .order("performed_at", { ascending: false })
            .limit(500)
        : Promise.resolve({ data: [], error: null }),
      context.admin
        .from("notifications")
        .select("*")
        .eq("recipient_id", context.auth.user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  const relatedError =
    projectsResult.error ||
    clientsResult.error ||
    profilesResult.error ||
    activitiesResult.error ||
    notificationsResult.error;
  if (relatedError) {
    return NextResponse.json({ error: relatedError.message }, { status: 500 });
  }

  const projectMap = new Map(
    (projectsResult.data ?? []).map((project) => [project.id, project]),
  );
  const clientMap = new Map(
    (clientsResult.data ?? []).map((client) => [client.id, client]),
  );
  const profileMap = new Map(
    (profilesResult.data ?? []).map((profile) => [profile.id, profile]),
  );
  const activitiesByTask = new Map<string, ActivityRow[]>();
  for (const activity of (activitiesResult.data ?? []) as ActivityRow[]) {
    if (!activity.follow_up_task_id) continue;
    const rows = activitiesByTask.get(activity.follow_up_task_id) ?? [];
    rows.push(activity);
    activitiesByTask.set(activity.follow_up_task_id, rows);
  }

  let availableProjects: Array<{
    id: string;
    project_number: string;
    project_name: string;
    sales_status: string;
  }> = [];
  let assignees: Array<{
    id: string;
    full_name: string | null;
    email: string;
    role: string;
  }> = [];

  {
    let availableProjectsQuery = context.admin
        .from("projects")
        .select("id, project_number, project_name, sales_status")
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(150);
    if (projectId) {
      availableProjectsQuery = availableProjectsQuery.eq("id", projectId);
    }

    const [availableProjectsResult, assigneesResult] = await Promise.all([
      availableProjectsQuery,
      context.admin
        .from("profiles")
        .select("id, full_name, email, role")
        .eq("is_active", true)
        .neq("status", "Inactive")
        .in("role", [
          "Admin",
          "Sales Manager",
          "Indoor Sales",
          "Branch Manager",
        ])
        .order("full_name"),
    ]);
    if (availableProjectsResult.error || assigneesResult.error) {
      return NextResponse.json(
        {
          error:
            availableProjectsResult.error?.message ??
            assigneesResult.error?.message,
        },
        { status: 500 },
      );
    }
    availableProjects = availableProjectsResult.data ?? [];
    assignees = assigneesResult.data ?? [];
  }

  const enrichedTasks = tasks.map((task) => ({
    ...task,
    isMine:
      task.assigned_to === context.auth.user.id ||
      task.owner_id === context.auth.user.id,
    project: projectMap.get(task.project_id) ?? null,
    client: clientMap.get(task.client_id) ?? null,
    owner: task.owner_id ? profileMap.get(task.owner_id) ?? null : null,
    assignee: task.assigned_to
      ? profileMap.get(task.assigned_to) ?? null
      : null,
    activities: activitiesByTask.get(task.id) ?? [],
  }));

  return NextResponse.json({
    role: context.auth.role,
    currentUserId: context.auth.user.id,
    tasks: enrichedTasks,
    notifications: notificationsResult.data ?? [],
    availableProjects,
    assignees,
  });
}

export async function POST(request: Request) {
  const context = await loadContext();
  if (!context.ok) return context.response;

  const body = (await request.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "create_task") {
    const projectId =
      typeof body?.projectId === "string" ? body.projectId.trim() : "";
    const taskType =
      body?.taskType === "structure_readiness" ||
      body?.taskType === "quotation"
        ? body.taskType
        : "";
    const dueAt =
      typeof body?.dueAt === "string" && body.dueAt
        ? new Date(body.dueAt).toISOString()
        : "";
    const assignedTo =
      typeof body?.assignedTo === "string" && body.assignedTo
        ? body.assignedTo
        : null;
    if (!projectId || !taskType || !dueAt) {
      return NextResponse.json(
        { error: "Project, follow-up type, and due date are required." },
        { status: 400 },
      );
    }

    const { data, error } = await context.admin.rpc(
      "create_sales_follow_up_task",
      {
        target_project_id: projectId,
        target_task_type: taskType,
        target_due_at: dueAt,
        target_assignee_id: assignedTo,
        target_interval_source: "manual",
        actor_user_id: context.auth.user.id,
      },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ task: data }, { status: 201 });
  }

  if (action === "record_activity") {
    const taskId =
      typeof body?.taskId === "string" ? body.taskId.trim() : "";
    const method = typeof body?.method === "string" ? body.method : "";
    const nextDueAt =
      typeof body?.nextDueAt === "string" && body.nextDueAt
        ? new Date(body.nextDueAt).toISOString()
        : null;
    if (!taskId || !method) {
      return NextResponse.json(
        { error: "Task and activity method are required." },
        { status: 400 },
      );
    }

    const { data, error } = await context.admin.rpc(
      "record_sales_follow_up_activity",
      {
        target_task_id: taskId,
        activity_method: method,
        activity_client_answered:
          typeof body?.clientAnswered === "boolean"
            ? body.clientAnswered
            : null,
        activity_client_response:
          typeof body?.clientResponse === "string"
            ? body.clientResponse.trim()
            : null,
        activity_internal_notes:
          typeof body?.internalNotes === "string"
            ? body.internalNotes.trim()
            : null,
        activity_outcome:
          typeof body?.outcome === "string" ? body.outcome.trim() : null,
        next_due_at: nextDueAt,
        complete_task: body?.completeTask === true,
        actor_user_id: context.auth.user.id,
      },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ activity: data }, { status: 201 });
  }

  return NextResponse.json(
    { error: "Select a valid CRM action." },
    { status: 400 },
  );
}
