import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(request: Request) {
  const adminCheck = await requireAdminUser();

  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status },
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
