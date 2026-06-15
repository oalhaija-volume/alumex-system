import type { AppRole } from "@/lib/auth/roles";

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
  if (role === "Sales Rep") {
    return 2;
  }

  if (role === "Sales Manager") {
    return 4;
  }

  if (role === "Branch Manager") {
    return 6;
  }

  return 100;
}

export function clampDiscount(value: number, limit: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), limit);
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
