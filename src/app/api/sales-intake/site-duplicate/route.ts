import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import {
  outdoorSiteDuplicateRadiusMeters,
  parseProjectLocation,
} from "@/lib/location/coordinates";

type DuplicateSiteBody = {
  latitude?: unknown;
  longitude?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireRole(["Outdoor Sales"]);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
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

  // Duplicate-site checks are paused, including for older open intake forms.
  return NextResponse.json({
    duplicate: false,
    radiusMeters: outdoorSiteDuplicateRadiusMeters,
  });
}
