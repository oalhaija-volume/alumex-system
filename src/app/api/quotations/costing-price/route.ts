import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

const quotationRoles = [
  "Admin",
  "Sales Manager",
  "Sales Rep",
  "Branch Manager",
] as const;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function moneyValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(number, 0) : 0;
}

export async function GET(request: Request) {
  const authCheck = await requireRole(quotationRoles);

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

  const projectId = new URL(request.url).searchParams.get("projectId") ?? "";

  if (!uuidPattern.test(projectId)) {
    return NextResponse.json(
      { error: "A valid project is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("project_costings")
    .select(
      "aluminum_system_name, aluminum_system_cost, installation_cost, fabrication_cost, glass_cost, shipping_cost, total_profit, total_project_cost, updated_at",
    )
    .eq("project_id", projectId)
    .eq("handoff_status", "sent_to_sales")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        error: friendlyDatabaseError(
          error,
          "Unable to load the project costing price.",
        ),
      },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json({ costing: null });
  }

  const calculatedTotal =
    moneyValue(data.aluminum_system_cost) +
    moneyValue(data.installation_cost) +
    moneyValue(data.fabrication_cost) +
    moneyValue(data.glass_cost) +
    moneyValue(data.shipping_cost) +
    moneyValue(data.total_profit);
  const recordedTotal = moneyValue(data.total_project_cost);

  return NextResponse.json({
    costing: {
      aluminumSystemName: data.aluminum_system_name,
      totalPrice: recordedTotal > 0 ? recordedTotal : calculatedTotal,
      updatedAt: data.updated_at,
      pricingSource: "project_costing",
    },
  });
}
