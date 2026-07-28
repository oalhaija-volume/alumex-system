import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import {
  distanceBetweenCoordinatesMeters,
  outdoorSiteDuplicateRadiusMeters,
  parseProjectLocation,
} from "@/lib/location/coordinates";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DuplicateSiteBody = {
  clientId?: unknown;
  latitude?: unknown;
  longitude?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireRole(["Outdoor Sales"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json({ error: supabaseServiceRoleError }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as
    | DuplicateSiteBody
    | null;
  const clientId =
    typeof body?.clientId === "string" ? body.clientId.trim() : "";
  const location = parseProjectLocation(body?.latitude, body?.longitude);

  if (!uuidPattern.test(clientId) || !location.isValid) {
    return NextResponse.json(
      { error: "Select a customer and add a valid project location." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("projects")
    .select("location_latitude, location_longitude")
    .eq("client_id", clientId)
    .is("archived_at", null)
    .not("location_latitude", "is", null)
    .not("location_longitude", "is", null);

  if (error) {
    return NextResponse.json(
      { error: "Unable to check the project location." },
      { status: 500 },
    );
  }

  const duplicate = (data ?? []).some((project) => {
    if (
      project.location_latitude === null ||
      project.location_longitude === null ||
      location.latitude === null ||
      location.longitude === null
    ) {
      return false;
    }

    return (
      distanceBetweenCoordinatesMeters(
        {
          latitude: location.latitude,
          longitude: location.longitude,
        },
        {
          latitude: project.location_latitude,
          longitude: project.location_longitude,
        },
      ) <= outdoorSiteDuplicateRadiusMeters
    );
  });

  return NextResponse.json({
    duplicate,
    radiusMeters: outdoorSiteDuplicateRadiusMeters,
  });
}
