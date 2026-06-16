import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey, supabaseServiceRoleError } from "@/lib/supabase/config";

type DriverPayload = {
  driver_name?: unknown;
  license_number?: unknown;
  phone?: unknown;
  vehicle_id?: unknown;
  is_active?: unknown;
};

export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("drivers")
    .select("*, vehicles(id, vehicle_name, cubic_size)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const authCheck = await requireAdminUser();
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

  const user = authCheck.user;
  const body: DriverPayload = await request.json();

  // Validate input
  const driverName = typeof body.driver_name === "string" ? body.driver_name.trim() : "";
  const licenseNumber = typeof body.license_number === "string" ? body.license_number.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const vehicleId = typeof body.vehicle_id === "string" ? body.vehicle_id : null;

  if (!driverName) {
    return NextResponse.json(
      { error: "Driver name is required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("drivers")
    .insert([
      {
        driver_name: driverName,
        license_number: licenseNumber || null,
        phone: phone || null,
        vehicle_id: vehicleId,
        is_active: true,
        created_by: user.id,
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function PUT(request: Request) {
  const authCheck = await requireAdminUser();
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

  const body: DriverPayload & { id: string } = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "Driver ID is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("drivers")
    .update({
      driver_name: typeof updates.driver_name === "string" ? updates.driver_name.trim() : undefined,
      license_number: typeof updates.license_number === "string" ? updates.license_number.trim() : undefined,
      phone: typeof updates.phone === "string" ? updates.phone.trim() : undefined,
      vehicle_id: typeof updates.vehicle_id === "string" ? updates.vehicle_id : undefined,
      is_active: typeof updates.is_active === "boolean" ? updates.is_active : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const authCheck = await requireAdminUser();
  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Driver ID is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("drivers").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
