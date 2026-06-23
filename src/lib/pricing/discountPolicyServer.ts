import type { AppRole } from "@/lib/auth/roles";
import {
  defaultDiscountLimitForRole,
  defaultDiscountPolicies,
  discountLimitFromPolicies,
  type DiscountPolicy,
} from "@/lib/pricing/discountPolicy";
import { createAdminClient } from "@/lib/supabase/admin";

type DiscountPolicyRow = {
  role: string | null;
  max_discount_percent: number | string | null;
};

export async function loadDiscountPoliciesForServer(
  admin: ReturnType<typeof createAdminClient>,
): Promise<DiscountPolicy[]> {
  const { data, error } = await admin
    .from("discount_policy_settings")
    .select("role, max_discount_percent")
    .order("role", { ascending: true });

  if (error) {
    console.error("[discountPolicy] falling back to default limits", error);
    return defaultDiscountPolicies;
  }

  const policies = ((data ?? []) as DiscountPolicyRow[])
    .map((row) => ({
      role: row.role as AppRole,
      max_discount_percent: Number(row.max_discount_percent ?? 0),
    }))
    .filter((policy) => Number.isFinite(policy.max_discount_percent));

  return policies.length > 0 ? policies : defaultDiscountPolicies;
}

export async function discountLimitForRoleFromSettings(
  role: AppRole | null,
  admin: ReturnType<typeof createAdminClient>,
) {
  if (role === "Admin") {
    return defaultDiscountLimitForRole(role);
  }

  const policies = await loadDiscountPoliciesForServer(admin);
  return discountLimitFromPolicies(role, policies);
}
