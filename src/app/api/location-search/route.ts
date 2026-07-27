import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";

const locationSearchRoles = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Outdoor Sales",
  "Sales Rep",
] as const;

type NominatimResult = {
  place_id?: number;
  osm_type?: string;
  osm_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
};

export async function GET(request: Request) {
  const authCheck = await requireRole(locationSearchRoles);

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  const requestUrl = new URL(request.url);
  const query = requestUrl.searchParams.get("q")?.trim() ?? "";
  const latitude = Number(requestUrl.searchParams.get("lat"));
  const longitude = Number(requestUrl.searchParams.get("lng"));
  const isReverseLookup =
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180;

  if (!isReverseLookup && (query.length < 3 || query.length > 200)) {
    return NextResponse.json(
      { error: "Enter at least 3 characters to search for a location." },
      { status: 400 },
    );
  }

  const searchUrl = new URL(
    isReverseLookup
      ? "https://nominatim.openstreetmap.org/reverse"
      : "https://nominatim.openstreetmap.org/search",
  );
  searchUrl.searchParams.set("format", "jsonv2");
  searchUrl.searchParams.set("addressdetails", "1");
  if (isReverseLookup) {
    searchUrl.searchParams.set("lat", String(latitude));
    searchUrl.searchParams.set("lon", String(longitude));
  } else {
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("limit", "5");
  }

  try {
    const response = await fetch(searchUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "AlumexQuotationSystem/1.0",
      },
      next: { revalidate: 86400 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "The location search service is temporarily unavailable." },
        { status: 502 },
      );
    }

    const responseBody = (await response.json()) as
      | NominatimResult
      | NominatimResult[];
    const places = Array.isArray(responseBody) ? responseBody : [responseBody];
    const results = places.flatMap((place) => {
      const latitude = Number(place.lat);
      const longitude = Number(place.lon);

      if (
        !place.display_name ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        return [];
      }

      return [
        {
          id: `${place.osm_type ?? "place"}-${place.osm_id ?? place.place_id ?? place.display_name}`,
          label: place.display_name,
          latitude,
          longitude,
        },
      ];
    });

    return isReverseLookup
      ? NextResponse.json({ result: results[0] ?? null })
      : NextResponse.json({ results });
  } catch (error) {
    console.error("[api/location-search] search failed", {
      route: "/api/location-search",
      error,
    });

    return NextResponse.json(
      { error: "The location search service is temporarily unavailable." },
      { status: 502 },
    );
  }
}
