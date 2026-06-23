import { NextResponse } from "next/server";
import { requireAdminUser, requireRole } from "@/lib/auth/adminServer";
import { isAppRole } from "@/lib/auth/roles";
import {
  defaultDiscountPolicies,
  type DiscountPolicy,
} from "@/lib/pricing/discountPolicy";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";

const discountPolicyRoles = [
  "Admin",
  "Sales Manager",
  "Sales Rep",
  "Branch Manager",
] as const;

type PolicyPayload = {
  policies?: unknown;
};

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function mapPolicies(value: unknown, userId: string) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.reduce<
    Array<{
      role: DiscountPolicy["role"];
      max_discount_percent: number;
      updated_by: string;
    }>
  >((policies, item) => {
    const row = item as { role?: unknown; max_discount_percent?: unknown };
    const role = isAppRole(row.role) ? row.role : null;

    if (!role) {
      return policies;
    }

    policies.push({
      role,
      max_discount_percent: Math.min(
        Math.max(numberValue(row.max_discount_percent), 0),
        100,
      ),
      updated_by: userId,
    });

    return policies;
  }, []);
}

export async function GET() {
  const authCheck = await requireRole(discountPolicyRoles);

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

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("discount_policy_settings")
    .select("role, max_discount_percent")
    .order("role", { ascending: true });

  if (error) {
    return NextResponse.json({
      policies: defaultDiscountPolicies,
      warning: friendlyDatabaseError(error, "Using default discount policies."),
    });
  }

  return NextResponse.json({
    policies: data && data.length > 0 ? data : defaultDiscountPolicies,
  });
}

export async function PUT(request: Request) {
  const adminCheck = await requireAdminUser();

  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status },
    );
  }

  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: supabaseServiceRoleError },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as PolicyPayload | null;
  const policies = mapPolicies(body?.policies, adminCheck.user.id);

  if (!body || policies.length === 0) {
    return NextResponse.json(
      { error: "At least one valid discount policy is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("discount_policy_settings")
    .upsert(policies, { onConflict: "role" })
    .select("role, max_discount_percent");

  if (error) {
    return NextResponse.json(
      {
        error: friendlyDatabaseError(error, "Unable to save discount policies."),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ policies: data ?? [] });
}
