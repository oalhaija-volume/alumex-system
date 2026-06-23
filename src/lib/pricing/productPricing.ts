import type { AppRole } from "@/lib/auth/roles";
import { defaultDiscountLimitForRole } from "@/lib/pricing/discountPolicy";

export { clampDiscount } from "@/lib/pricing/discountPolicy";

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
  return defaultDiscountLimitForRole(role);
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
