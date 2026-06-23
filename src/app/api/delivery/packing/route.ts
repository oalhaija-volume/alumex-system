import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  recommendVehiclesForPacking,
  type PackingQuotationItem,
  type PackingVehicle,
} from "@/lib/delivery/packing";

const deliveryRoles = ["Admin", "Delivery Head", "Delivery Team"] as const;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const authCheck = await requireRole(deliveryRoles);

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId") ?? "";

  if (!uuidPattern.test(projectId)) {
    return NextResponse.json(
      { error: "A valid project id is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: quotation, error: quotationError } = await admin
    .from("quotations")
    .select("id, quotation_number, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (quotationError) {
    return NextResponse.json(
      { error: quotationError.message ?? "Unable to load quotation." },
      { status: 500 },
    );
  }

  if (!quotation) {
    return NextResponse.json({
      quotation: null,
      recommendation: recommendVehiclesForPacking({ items: [], vehicles: [] }),
    });
  }

  const [{ data: items, error: itemsError }, { data: vehicles, error: vehiclesError }] =
    await Promise.all([
      admin
        .from("quotation_items")
        .select(
          "id, opening_code, floor, room, width, height, quantity, product_system, glass_type, aluminum_color",
        )
        .eq("quotation_id", quotation.id),
      admin
        .from("vehicles")
        .select("id, vehicle_name, cubic_size, plate_number")
        .eq("is_active", true)
        .order("cubic_size", { ascending: true }),
    ]);

  if (itemsError) {
    return NextResponse.json(
      { error: itemsError.message ?? "Unable to load quotation goods." },
      { status: 500 },
    );
  }

  if (vehiclesError) {
    return NextResponse.json(
      { error: vehiclesError.message ?? "Unable to load trucks." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    quotation: {
      id: quotation.id,
      quotationNumber: quotation.quotation_number,
      createdAt: quotation.created_at,
    },
    recommendation: recommendVehiclesForPacking({
      items: (items ?? []) as PackingQuotationItem[],
      vehicles: (vehicles ?? []) as PackingVehicle[],
    }),
  });
}
