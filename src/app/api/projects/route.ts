import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

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
    return NextResponse.json(
      { error: quotationsError.message },
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
      return NextResponse.json(
        { error: quotationItemsError.message },
        { status: 500 },
      );
    }
  }

  const { error: documentsError } = await admin
    .from("documents")
    .delete()
    .in("project_id", projectIds);

  if (documentsError) {
    console.error("[api/projects] optional project documents cleanup failed", {
      route: "/api/projects",
      operation: "delete-project-documents",
      table: "public.documents",
      client: "createAdminClient",
      executingRole: "service_role",
      error: documentsError,
    });
  }

  const deleteSteps = [
    admin.from("contracts").delete().in("project_id", projectIds),
    admin.from("quotations").delete().in("project_id", projectIds),
    admin.from("openings").delete().in("project_id", projectIds),
    admin.from("projects").delete().in("id", projectIds),
  ];

  for (const deleteStep of deleteSteps) {
    const { error } = await deleteStep;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
