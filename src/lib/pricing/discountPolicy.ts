import type { AppRole } from "@/lib/auth/roles";
import {
  invalidateClientData,
  loadCachedClientData,
} from "@/lib/clientRequestCache";

export type DiscountPolicy = {
  role: AppRole;
  max_discount_percent: number;
};

export const defaultDiscountPolicies: DiscountPolicy[] = [
  { role: "Indoor Sales", max_discount_percent: 2 },
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

const discountPoliciesCacheKey = "settings:discount-policies";

export function invalidateDiscountPoliciesCache() {
  invalidateClientData(discountPoliciesCacheKey);
}

export async function loadDiscountPolicies(): Promise<DiscountPolicy[]> {
  return loadCachedClientData(
    discountPoliciesCacheKey,
    async () => {
      const response = await fetch("/api/settings/discount-policies");
      const body = (await response.json().catch(() => null)) as {
        policies?: DiscountPolicy[];
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to load discount policies.");
      }

      return body?.policies ?? defaultDiscountPolicies;
    },
    { ttlMs: 5 * 60_000 },
  );
}
