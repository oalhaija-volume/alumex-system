import type { AppRole } from "@/lib/auth/roles";

export type ProductPrice = {
  id?: string;
  product_name: string;
  category: string | null;
  unit: string;
  unit_price: number;
  is_active: boolean;
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

export function normalizeProductName(value: string) {
  return value.trim().toLowerCase();
}

export function productPriceForSystem(
  system: string,
  products: ProductPrice[],
) {
  const normalizedSystem = normalizeProductName(system);
  const product = products.find(
    (item) =>
      item.is_active &&
      normalizeProductName(item.product_name) === normalizedSystem,
  );

  return product?.unit_price ?? defaultUnitPrice(system);
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

export async function loadProductPrices(): Promise<ProductPrice[]> {
  const response = await fetch("/api/settings/product-prices", {
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as {
    products?: ProductPrice[];
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(body?.error ?? "Unable to load product prices.");
  }

  return body?.products ?? [];
}
