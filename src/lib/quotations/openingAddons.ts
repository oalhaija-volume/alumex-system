type OpeningAddonLine = {
  lineType?: "base" | "service" | "addon" | "accessory";
  openingType?: string;
  openingCode: string;
};

type CatalogProduct = {
  product_name: string;
  category: string | null;
  is_active: boolean;
};

const addonOpeningTypes = new Set(["Window", "Door", "Curtain Wall"]);
const legacyOpeningAddonNames = new Set([
  "roller shutters",
  "photocell doors",
  "a swing door",
  "louver",
]);

function inferredOpeningType(line: OpeningAddonLine) {
  if (line.openingType) return line.openingType;

  const code = line.openingCode.trim().toUpperCase();
  if (/^CW-\d+/.test(code)) return "Curtain Wall";
  if (/^W-\d+/.test(code)) return "Window";
  if (/^D-\d+/.test(code)) return "Door";
  if (/^SK-\d+/.test(code)) return "Skylight";
  if (/^L-\d+/.test(code)) return "Louver";

  return "";
}

export function canAttachAddonToOpening(line: OpeningAddonLine) {
  return (
    (line.lineType ?? "base") === "base" &&
    addonOpeningTypes.has(inferredOpeningType(line))
  );
}

export function openingAddonProducts<T extends CatalogProduct>(products: T[]) {
  return products.filter(
    (product) =>
      product.is_active &&
      (product.category?.trim().toLowerCase().replace(/[\s-]+/g, "_") ===
        "addon" ||
        legacyOpeningAddonNames.has(product.product_name.trim().toLowerCase())),
  );
}

export function projectServiceProducts<T extends CatalogProduct>(products: T[]) {
  return products.filter(
    (product) =>
      product.is_active &&
      ["service", "services"].includes(
        product.category?.trim().toLowerCase() ?? "",
      ) &&
      !legacyOpeningAddonNames.has(product.product_name.trim().toLowerCase()),
  );
}
