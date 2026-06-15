import { NextResponse } from "next/server";
import { requireAdminUser, requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";
import { friendlyDatabaseError, isDuplicateError } from "@/lib/friendlyErrors";

const duplicateClientMessage = "Client already exists.";
const clientHasProjectsMessage = "Client has projects and cannot be deleted";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ClientPayload = {
  client_name?: unknown;
  mobile?: unknown;
  alternate_mobile?: unknown;
  address?: unknown;
  province?: unknown;
  city?: unknown;
  email?: unknown;
  notes?: unknown;
};

type ExistingClient = {
  id: string;
  client_name: string | null;
  mobile: string | null;
  email: string | null;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

async function findDuplicateClient({
  clientName,
  mobile,
  email,
  excludeId,
}: {
  clientName: string;
  mobile: string;
  email: string;
  excludeId?: string;
}) {
  const admin = createAdminClient();
  const normalizedMobile = normalizePhone(mobile);
  const normalizedEmail = normalizeEmail(email);
  const { data: existingClients, error } = await admin
    .from("clients")
    .select("id, client_name, mobile, email");

  if (error) {
    return { error };
  }

  const duplicate = ((existingClients ?? []) as ExistingClient[]).some(
    (client) => {
      if (excludeId && client.id === excludeId) {
        return false;
      }

      const existingMobile = normalizePhone(client.mobile ?? "");
      const existingEmail = normalizeEmail(client.email ?? "");
      const existingName = (client.client_name ?? "").trim();

      return (
        (normalizedMobile && existingMobile === normalizedMobile) ||
        (normalizedEmail && existingEmail === normalizedEmail) ||
        (existingName === clientName && existingMobile === normalizedMobile)
      );
    },
  );

  return { duplicate };
}

const clientWriteRoles = ["Admin", "Sales Manager", "Sales Rep"] as const;

export async function POST(request: Request) {
  const authCheck = await requireRole(clientWriteRoles);

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

  const body = (await request.json().catch(() => null)) as ClientPayload | null;

  if (!body) {
    return NextResponse.json(
      { error: "Client payload is required." },
      { status: 400 },
    );
  }

  const clientName = textValue(body.client_name);
  const mobile = textValue(body.mobile);
  const email = textValue(body.email);

  if (!clientName || !mobile || !textValue(body.address)) {
    return NextResponse.json(
      { error: "Client name, phone number, and address are required." },
      { status: 400 },
    );
  }

  const duplicateCheck = await findDuplicateClient({
    clientName,
    mobile,
    email,
  });

  if (duplicateCheck.error) {
    console.error("[api/clients] duplicate check failed", {
      route: "/api/clients",
      operation: "duplicate-check",
      table: "public.clients",
      client: "createAdminClient",
      executingRole: "service_role",
      error: duplicateCheck.error,
    });

    return NextResponse.json(
      { error: friendlyDatabaseError(duplicateCheck.error, "Unable to verify client duplicates.") },
      { status: 500 },
    );
  }

  if (duplicateCheck.duplicate) {
    return NextResponse.json({ error: duplicateClientMessage }, { status: 409 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clients")
    .insert({
      client_name: clientName,
      mobile,
      alternate_mobile: textValue(body.alternate_mobile) || null,
      address: textValue(body.address),
      province: textValue(body.province) || null,
      city: textValue(body.city) || null,
      email: normalizeEmail(email) || null,
      notes: textValue(body.notes) || null,
      created_by: authCheck.user.id,
    })
    .select("id")
    .single();

  if (error) {
    const isDuplicate = isDuplicateError(error);
    console.error("[api/clients] create failed", {
      route: "/api/clients",
      operation: "insert",
      table: "public.clients",
      client: "createAdminClient",
      executingRole: "service_role",
      error,
    });

    return NextResponse.json(
      {
        error: friendlyDatabaseError(
          error,
          "Unable to save client.",
          duplicateClientMessage,
        ),
      },
      { status: isDuplicate ? 409 : 500 },
    );
  }

  return NextResponse.json({ client: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const authCheck = await requireRole(clientWriteRoles);

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

  const body = (await request.json().catch(() => null)) as
    | (ClientPayload & { id?: unknown })
    | null;

  if (!body || typeof body.id !== "string" || !uuidPattern.test(body.id)) {
    return NextResponse.json(
      { error: "A valid client id is required." },
      { status: 400 },
    );
  }

  const clientName = textValue(body.client_name);
  const mobile = textValue(body.mobile);
  const email = textValue(body.email);

  if (!clientName || !mobile || !textValue(body.address)) {
    return NextResponse.json(
      { error: "Client name, phone number, and address are required." },
      { status: 400 },
    );
  }

  const duplicateCheck = await findDuplicateClient({
    clientName,
    mobile,
    email,
    excludeId: body.id,
  });

  if (duplicateCheck.error) {
    console.error("[api/clients] duplicate check failed", {
      route: "/api/clients",
      operation: "duplicate-check-update",
      table: "public.clients",
      client: "createAdminClient",
      executingRole: "service_role",
      error: duplicateCheck.error,
    });

    return NextResponse.json(
      { error: friendlyDatabaseError(duplicateCheck.error, "Unable to verify client duplicates.") },
      { status: 500 },
    );
  }

  if (duplicateCheck.duplicate) {
    return NextResponse.json({ error: duplicateClientMessage }, { status: 409 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clients")
    .update({
      client_name: clientName,
      mobile,
      alternate_mobile: textValue(body.alternate_mobile) || null,
      address: textValue(body.address),
      province: textValue(body.province) || null,
      city: textValue(body.city) || null,
      email: normalizeEmail(email) || null,
      notes: textValue(body.notes) || null,
    })
    .eq("id", body.id)
    .select("id")
    .maybeSingle();

  if (error) {
    const isDuplicate = isDuplicateError(error);
    console.error("[api/clients] update failed", {
      route: "/api/clients",
      operation: "update",
      table: "public.clients",
      client: "createAdminClient",
      executingRole: "service_role",
      error,
    });

    return NextResponse.json(
      {
        error: friendlyDatabaseError(
          error,
          "Unable to save client.",
          duplicateClientMessage,
        ),
      },
      { status: isDuplicate ? 409 : 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Client was not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ client: data });
}

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

  const { searchParams } = new URL(request.url);
  const clientId = searchParams.get("id") ?? "";

  if (!uuidPattern.test(clientId)) {
    return NextResponse.json(
      { error: "A valid client id is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { count: relatedProjectCount, error: projectsError } = await admin
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId);

  if (projectsError) {
    console.error("[api/clients] related projects check failed", {
      route: "/api/clients",
      operation: "related-projects-check",
      table: "public.projects",
      client: "createAdminClient",
      executingRole: "service_role",
      error: projectsError,
    });

    return NextResponse.json(
      { error: friendlyDatabaseError(projectsError, "Unable to verify related projects.") },
      { status: 500 },
    );
  }

  if ((relatedProjectCount ?? 0) > 0) {
    return NextResponse.json(
      { error: clientHasProjectsMessage },
      { status: 409 },
    );
  }

  const { data: deletedClient, error: deleteError } = await admin
    .from("clients")
    .delete()
    .eq("id", clientId)
    .select("id")
    .maybeSingle();

  if (deleteError) {
    console.error("[api/clients] delete failed", {
      route: "/api/clients",
      operation: "delete",
      table: "public.clients",
      client: "createAdminClient",
      executingRole: "service_role",
      error: deleteError,
    });

    return NextResponse.json(
      { error: friendlyDatabaseError(deleteError, "Unable to delete client.") },
      { status: 500 },
    );
  }

  if (!deletedClient) {
    return NextResponse.json(
      { error: "Client was not deleted. It may already have been removed." },
      { status: 404 },
    );
  }

  return NextResponse.json({ client: deletedClient });
}
