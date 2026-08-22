import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import {
  hasNearbyProjectSite,
  outdoorSiteDuplicateRadiusMeters,
  parseProjectLocation,
} from "@/lib/location/coordinates";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

type DuplicateSiteBody = {
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
  const location = parseProjectLocation(body?.latitude, body?.longitude);

  if (!location.isValid) {
    return NextResponse.json(
      { error: "Add a valid project location." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("projects")
    .select("location_latitude, location_longitude")
    .eq("original_creator_role", "Outdoor Sales")
    .is("archived_at", null)
    .not("location_latitude", "is", null)
    .not("location_longitude", "is", null);

  if (error) {
    return NextResponse.json(
      { error: "Unable to check the project location." },
      { status: 500 },
    );
  }

  const duplicate =
    location.latitude !== null &&
    location.longitude !== null &&
    hasNearbyProjectSite(
      { latitude: location.latitude, longitude: location.longitude },
      (data ?? []).flatMap((project) =>
        project.location_latitude === null || project.location_longitude === null
          ? []
          : [{
              latitude: project.location_latitude,
              longitude: project.location_longitude,
            }],
      ),
    );

  return NextResponse.json({
    duplicate,
    radiusMeters: outdoorSiteDuplicateRadiusMeters,
  });
}
