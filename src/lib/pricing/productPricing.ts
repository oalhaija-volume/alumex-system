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

export type ProductCatalogKind =
  | "aluminum_section"
  | "service"
  | "aluminum_system"
  | "service_variant"
  | "cladding_material"
  | "addon"
  | "other";

export type ProductPricingSource = "catalog" | "project_costing";

export const productCatalogCategories: Array<{
  value: ProductCatalogKind;
  labelKey: string;
  defaultUnit: string;
}> = [
  {
    value: "aluminum_section",
    labelKey: "settings.aluminumSections",
    defaultUnit: "sqm",
  },
  {
    value: "service",
    labelKey: "settings.services",
    defaultUnit: "sqm",
  },
  {
    value: "aluminum_system",
    labelKey: "settings.aluminumSystems",
    defaultUnit: "sqm",
  },
  {
    value: "service_variant",
    labelKey: "settings.serviceVariants",
    defaultUnit: "sqm",
  },
  {
    value: "cladding_material",
    labelKey: "settings.claddingMaterials",
    defaultUnit: "sqm",
  },
  {
    value: "addon",
    labelKey: "settings.addons",
    defaultUnit: "item",
  },
  {
    value: "other",
    labelKey: "settings.otherProducts",
    defaultUnit: "item",
  },
];

export function productCatalogKind(
  category: string | null | undefined,
): ProductCatalogKind {
  const normalizedCategory = category?.trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (
    normalizedCategory === "aluminum_section" ||
    normalizedCategory === "aluminium_section" ||
    normalizedCategory === "section"
  ) {
    return "aluminum_section";
  }

  if (normalizedCategory === "service" || normalizedCategory === "services") {
    return "service";
  }

  if (normalizedCategory === "aluminum_system") {
    return "aluminum_system";
  }

  if (normalizedCategory === "service_variant") {
    return "service_variant";
  }

  if (normalizedCategory === "cladding_material") {
    return "cladding_material";
  }

  if (normalizedCategory === "addon" || normalizedCategory === "add_on") {
    return "addon";
  }

  return "other";
}

export function productsForCatalog(
  products: ProductPrice[],
  kind: ProductCatalogKind,
  activeOnly = false,
) {
  return products.filter(
    (product) =>
      productCatalogKind(product.category) === kind &&
      (!activeOnly || product.is_active),
  );
}

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

export function isGeorgianBarsName(value: string) {
  const normalizedName = normalizeProductName(value);
  return normalizedName === "georgian bars" || normalizedName === "georgien bars";
}

export function aluminumSystemPricingSource(
  productName: string,
): ProductPricingSource {
  const normalizedName = normalizeProductName(productName);

  return normalizedName.includes("alumex") || normalizedName.includes("the address")
    ? "catalog"
    : "project_costing";
}

export function productPricingSource(
  product: Pick<ProductPrice, "product_name" | "category">,
): ProductPricingSource {
  return productCatalogKind(product.category) === "aluminum_system"
    ? aluminumSystemPricingSource(product.product_name)
    : "catalog";
}

export function enforceProductPricingRules<
  T extends Pick<ProductPrice, "product_name" | "category" | "unit" | "unit_price">,
>(product: T): T {
  if (isGeorgianBarsName(product.product_name)) {
    return {
      ...product,
      product_name: "Georgian Bars",
      category: "addon",
      unit: "meter",
    };
  }

  if (productPricingSource(product) === "project_costing") {
    return {
      ...product,
      unit: "project",
      unit_price: 0,
    };
  }

  if (
    productCatalogKind(product.category) === "aluminum_system" &&
    normalizeProductName(product.unit) === "project"
  ) {
    return {
      ...product,
      unit: "sqm",
    };
  }

  return product;
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

  return (body?.products ?? []).map((product) =>
    enforceProductPricingRules(product),
  );
}
