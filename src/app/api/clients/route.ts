import { NextResponse } from "next/server";
import { requireAdminUser, requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";
import { loadOutdoorSalesProjectIds } from "@/lib/projects/access";

const clientHasProjectsMessage = "Client has projects and cannot be deleted";
const clientReadRoles = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Outdoor Sales",
  "Sales Rep",
  "Branch Manager",
] as const;
const clientWriteRoles = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Outdoor Sales",
  "Sales Rep",
  "Branch Manager",
] as const;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clientColumns =
  "id, client_name, mobile, alternate_mobile, address, province, city, email, notes, created_by";
const clientColumnsWithLocation =
  `${clientColumns}, location_latitude, location_longitude`;

type ClientPayload = {
  client_name?: unknown;
  mobile?: unknown;
  alternate_mobile?: unknown;
  address?: unknown;
  province?: unknown;
  city?: unknown;
  email?: unknown;
  notes?: unknown;
  location_latitude?: unknown;
  location_longitude?: unknown;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function coordinateValue(value: unknown, minimum: number, maximum: number) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : null;
}

function isMissingClientLocationColumn(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const databaseError = error as { code?: unknown; message?: unknown };
  const code = typeof databaseError.code === "string" ? databaseError.code : "";
  const message =
    typeof databaseError.message === "string" ? databaseError.message : "";

  return (
    (code === "42703" || code === "PGRST204") &&
    /location_(latitude|longitude)/i.test(message)
  );
}

async function outdoorSalesClientIds(userId: string) {
  const admin = createAdminClient();
  const { data: ownedClients, error: clientsError } = await admin
    .from("clients")
    .select("id")
    .eq("created_by", userId);
  const { data: ownedProjects, error: projectsError } = await admin
    .from("projects")
    .select("id, client_id");
  const projectScope = await loadOutdoorSalesProjectIds(userId);

  if (clientsError || projectsError || projectScope.error) {
    return {
      ids: new Set<string>(),
      error: clientsError ?? projectsError ?? projectScope.error,
    };
  }

  return {
    ids: new Set([
      ...(ownedClients ?? []).map((client) => client.id),
      ...(ownedProjects ?? [])
        .filter((project) => projectScope.ids.has(project.id))
        .map((project) => project.client_id)
        .filter((clientId): clientId is string => Boolean(clientId)),
    ]),
    error: null,
  };
}

export async function GET() {
  const authCheck = await requireRole(clientReadRoles);

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

  const admin = createAdminClient();
  const outdoorScope =
    authCheck.role === "Outdoor Sales"
      ? await outdoorSalesClientIds(authCheck.user.id)
      : null;

  if (outdoorScope?.error) {
    return NextResponse.json(
      {
        error: friendlyDatabaseError(
          outdoorScope.error,
          "Unable to verify client access.",
        ),
      },
      { status: 500 },
    );
  }

  const visibleClients = <T extends { id: string }>(clients: T[]) =>
    outdoorScope
      ? clients.filter((client) => outdoorScope.ids.has(client.id))
      : clients;
  const clientsWithLocation = await admin
    .from("clients")
    .select(clientColumnsWithLocation)
    .order("created_at", { ascending: false });

  if (isMissingClientLocationColumn(clientsWithLocation.error)) {
    const clientsWithoutLocation = await admin
      .from("clients")
      .select(clientColumns)
      .order("created_at", { ascending: false });

    if (clientsWithoutLocation.error) {
      console.error("[api/clients] fallback load failed", {
        route: "/api/clients",
        operation: "select-without-location",
        table: "public.clients",
        client: "createAdminClient",
        executingRole: "service_role",
        error: clientsWithoutLocation.error,
      });

      return NextResponse.json(
        {
          error: friendlyDatabaseError(
            clientsWithoutLocation.error,
            "Unable to load clients.",
          ),
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      clients: visibleClients(clientsWithoutLocation.data ?? []).map(
        (client) => ({
          ...client,
          location_latitude: null,
          location_longitude: null,
        }),
      ),
    });
  }

  if (clientsWithLocation.error) {
    console.error("[api/clients] load failed", {
      route: "/api/clients",
      operation: "select",
      table: "public.clients",
      client: "createAdminClient",
      executingRole: "service_role",
      error: clientsWithLocation.error,
    });

    return NextResponse.json(
      {
        error: friendlyDatabaseError(
          clientsWithLocation.error,
          "Unable to load clients.",
        ),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    clients: visibleClients(clientsWithLocation.data ?? []),
  });
}

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

  const admin = createAdminClient();
  const clientPayload = {
    client_name: clientName,
    mobile,
    alternate_mobile: textValue(body.alternate_mobile) || null,
    address: textValue(body.address),
    province: textValue(body.province) || null,
    city: textValue(body.city) || null,
    email: normalizeEmail(email) || null,
    notes: textValue(body.notes) || null,
    created_by: authCheck.user.id,
  };
  const insertWithLocation = await admin
    .from("clients")
    .insert({
      ...clientPayload,
      location_latitude: coordinateValue(body.location_latitude, -90, 90),
      location_longitude: coordinateValue(body.location_longitude, -180, 180),
    })
    .select("id")
    .single();
  const { data, error } = isMissingClientLocationColumn(insertWithLocation.error)
    ? await admin.from("clients").insert(clientPayload).select("id").single()
    : insertWithLocation;

  if (error) {
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
        error: friendlyDatabaseError(error, "Unable to save client."),
      },
      { status: 500 },
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

  const admin = createAdminClient();
  if (authCheck.role === "Outdoor Sales") {
    const scope = await outdoorSalesClientIds(authCheck.user.id);

    if (scope.error) {
      return NextResponse.json(
        {
          error: friendlyDatabaseError(
            scope.error,
            "Unable to verify client access.",
          ),
        },
        { status: 500 },
      );
    }

    if (!scope.ids.has(body.id)) {
      return NextResponse.json(
        { error: "Assigned client access is required." },
        { status: 403 },
      );
    }
  }

  const clientPayload = {
    client_name: clientName,
    mobile,
    alternate_mobile: textValue(body.alternate_mobile) || null,
    address: textValue(body.address),
    province: textValue(body.province) || null,
    city: textValue(body.city) || null,
    email: normalizeEmail(email) || null,
    notes: textValue(body.notes) || null,
  };
  const updateWithLocation = await admin
    .from("clients")
    .update({
      ...clientPayload,
      location_latitude: coordinateValue(body.location_latitude, -90, 90),
      location_longitude: coordinateValue(body.location_longitude, -180, 180),
    })
    .eq("id", body.id)
    .select("id")
    .maybeSingle();
  const { data, error } = isMissingClientLocationColumn(updateWithLocation.error)
    ? await admin
        .from("clients")
        .update(clientPayload)
        .eq("id", body.id)
        .select("id")
        .maybeSingle()
    : updateWithLocation;

  if (error) {
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
        error: friendlyDatabaseError(error, "Unable to save client."),
      },
      { status: 500 },
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
