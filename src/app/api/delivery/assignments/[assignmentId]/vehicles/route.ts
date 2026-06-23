import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey, supabaseServiceRoleError } from "@/lib/supabase/config";

const deliveryRoles = ["Admin", "Delivery Head", "Delivery Team"] as const;

export async function GET(
  _request: Request,
  context: { params: Promise<{ assignmentId: string }> }
) {
  const authCheck = await requireRole([...deliveryRoles]);
  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  const { assignmentId } = await context.params;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("delivery_vehicles_with_capacity")
    .select(`
      id,
      delivery_assignment_id,
      vehicle_id,
      driver_id,
      cubic_space_used,
      cubic_space_available,
      notes,
      created_at,
      updated_at,
      vehicles(id, vehicle_name, cubic_size, plate_number),
      drivers(id, driver_name, license_number, phone)
    `)
    .eq("delivery_assignment_id", assignmentId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ assignmentId: string }> }
) {
  const authCheck = await requireRole(deliveryRoles);
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

  const { assignmentId } = await context.params;
  const body = await request.json();
  const { vehicleId, driverId, cubicSpaceUsed, notes } = body;

  if (!vehicleId) {
    return NextResponse.json(
      { error: "Vehicle ID is required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Verify vehicle exists and get its cubic size
  const { data: vehicle, error: vehicleError } = await admin
    .from("vehicles")
    .select("cubic_size")
    .eq("id", vehicleId)
    .single();

  if (vehicleError || !vehicle) {
    return NextResponse.json(
      { error: "Vehicle not found" },
      { status: 404 },
    );
  }

  const usedSpace = cubicSpaceUsed || 0;
  if (usedSpace > vehicle.cubic_size) {
    return NextResponse.json(
      { error: `Cubic space used (${usedSpace}) exceeds vehicle capacity (${vehicle.cubic_size})` },
      { status: 400 },
    );
  }

  const { data, error } = await admin
    .from("delivery_vehicles")
    .insert([
      {
        delivery_assignment_id: assignmentId,
        vehicle_id: vehicleId,
        driver_id: driverId || null,
        cubic_space_used: usedSpace,
        notes: notes || null,
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
