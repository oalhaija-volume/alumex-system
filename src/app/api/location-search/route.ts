import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";

const locationSearchRoles = [
  "Admin",
  "Sales Manager",
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

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (query.length < 3 || query.length > 200) {
    return NextResponse.json(
      { error: "Enter at least 3 characters to search for a location." },
      { status: 400 },
    );
  }

  const searchUrl = new URL("https://nominatim.openstreetmap.org/search");
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("format", "jsonv2");
  searchUrl.searchParams.set("limit", "5");
  searchUrl.searchParams.set("addressdetails", "1");

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

    const places = (await response.json()) as NominatimResult[];
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

    return NextResponse.json({ results });
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
