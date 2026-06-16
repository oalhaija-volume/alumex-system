import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey, supabaseServiceRoleError } from "@/lib/supabase/config";

type VehiclePayload = {
  vehicle_name?: unknown;
  cubic_size?: unknown;
  plate_number?: unknown;
  is_active?: unknown;
};

export async function GET() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vehicles")
    .select("*")
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
  const body: VehiclePayload = await request.json();

  // Validate input
  const vehicleName = typeof body.vehicle_name === "string" ? body.vehicle_name.trim() : "";
  const cubicSize = typeof body.cubic_size === "number" ? body.cubic_size : null;
  const plateNumber = typeof body.plate_number === "string" ? body.plate_number.trim() : "";

  if (!vehicleName || cubicSize === null || cubicSize <= 0) {
    return NextResponse.json(
      { error: "Vehicle name and cubic size (positive number) are required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vehicles")
    .insert([
      {
        vehicle_name: vehicleName,
        cubic_size: cubicSize,
        plate_number: plateNumber || null,
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

  const body: VehiclePayload & { id: string } = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "Vehicle ID is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vehicles")
    .update({
      vehicle_name: typeof updates.vehicle_name === "string" ? updates.vehicle_name.trim() : undefined,
      cubic_size: typeof updates.cubic_size === "number" ? updates.cubic_size : undefined,
      plate_number: typeof updates.plate_number === "string" ? updates.plate_number.trim() : undefined,
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
    return NextResponse.json({ error: "Vehicle ID is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("vehicles").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
