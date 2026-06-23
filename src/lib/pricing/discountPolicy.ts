import type { AppRole } from "@/lib/auth/roles";

export type DiscountPolicy = {
  role: AppRole;
  max_discount_percent: number;
};

export const defaultDiscountPolicies: DiscountPolicy[] = [
  { role: "Sales Rep", max_discount_percent: 2 },
  { role: "Sales Manager", max_discount_percent: 4 },
  { role: "Branch Manager", max_discount_percent: 6 },
  { role: "Admin", max_discount_percent: 100 },
];

export function defaultDiscountLimitForRole(role: AppRole | null) {
  return (
    defaultDiscountPolicies.find((policy) => policy.role === role)
      ?.max_discount_percent ?? 100
  );
}

export function discountLimitFromPolicies(
  role: AppRole | null,
  policies: DiscountPolicy[],
) {
  return (
    policies.find((policy) => policy.role === role)?.max_discount_percent ??
    defaultDiscountLimitForRole(role)
  );
}

export function clampDiscount(value: number, limit: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), limit);
}

export async function loadDiscountPolicies(): Promise<DiscountPolicy[]> {
  const response = await fetch("/api/settings/discount-policies", {
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as {
    policies?: DiscountPolicy[];
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(body?.error ?? "Unable to load discount policies.");
  }

  return body?.policies ?? defaultDiscountPolicies;
}
