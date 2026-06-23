import type { AppRole } from "@/lib/auth/roles";
import { defaultDiscountLimitForRole } from "@/lib/pricing/discountPolicy";

export { clampDiscount } from "@/lib/pricing/discountPolicy";

export type ProjectPrice = {
  id?: string;
  project_id: string;
  opening_id: string;
  unit_price: number;
  created_at?: string;
  updated_at?: string;
};

export function defaultUnitPrice(system: string) {
  const lowerSystem = system.toLowerCase();

  if (lowerSystem.includes("curtain")) {
    return 165;
  }

  if (lowerSystem.includes("sliding")) {
    return 95;
  }

  return 120;
}

export function discountLimitForRole(role: AppRole | null) {
  return defaultDiscountLimitForRole(role);
}

export async function loadProjectPrices(): Promise<ProjectPrice[]> {
  const response = await fetch("/api/settings/project-prices", {
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as {
    prices?: ProjectPrice[];
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(body?.error ?? "Unable to load project prices.");
  }

  return body?.prices ?? [];
}
