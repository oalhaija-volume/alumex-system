export const skylightItems = [
  { id: "connector", name: "Connector", unit: "m", priceCents: 3450 },
  { id: "mullion", name: "Mullion", unit: "m", priceCents: 3830 },
  { id: "transom", name: "Transom", unit: "m", priceCents: 2980 },
  { id: "fix4500", name: "FIX 4500", unit: "m", priceCents: 1530 },
  { id: "pressureCap", name: "Pressure Plate / Cap", unit: "m", priceCents: 1150 },
  { id: "curtainGasket", name: "Curtain Wall Gasket", unit: "m", priceCents: 300 },
  { id: "gasket4500", name: "Gasket 4500", unit: "m", priceCents: 150 },
  { id: "pressureGasket", name: "Pressure Plate / Gasket", unit: "m", priceCents: 150 },
  { id: "glass", name: "Glass", unit: "m²", priceCents: 12000 },
  { id: "brackets", name: "Brackets", unit: "pcs", priceCents: 1500 },
  { id: "sealant", name: "Silicon & Sealant", unit: "m", priceCents: 150 },
  { id: "screws", name: "Screws", unit: "pcs", priceCents: 5000 },
] as const;

export type SkylightItemId = (typeof skylightItems)[number]["id"];
export type SkylightQuantities = Partial<Record<SkylightItemId, string>>;
export const laminationPriceCents = 5500;

function manualAmount(value: string) {
  const raw = value.trim();
  const amount = raw === "" ? 0 : Number(raw);
  const valid = (raw === "" || /^\d+(?:\.\d{1,2})?$/.test(raw)) &&
    Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000;
  return { valid, cents: valid ? Math.round(amount * 100) : 0 };
}

export function calculateSkylight(quantities: SkylightQuantities, otherAmount = "", steelAmount = "") {
  const { valid: otherValid, cents: otherCents } = manualAmount(otherAmount);
  const { valid: steelValid, cents: steelCents } = manualAmount(steelAmount);
  const lines = skylightItems.map((item) => {
    const raw = quantities[item.id]?.trim() ?? "";
    const quantity = raw === "" ? 0 : Number(raw);
    const valid =
      (raw === "" || /^\d+(?:\.\d{1,3})?$/.test(raw)) &&
      Number.isFinite(quantity) &&
      quantity >= 0 &&
      quantity <= 1_000_000 &&
      (item.unit !== "pcs" || Number.isInteger(quantity));
    const scaledQuantity = valid ? Math.round(quantity * 1000) : 0;

    return {
      ...item,
      quantity: valid ? quantity : 0,
      valid,
      totalCents: Math.round((scaledQuantity * item.priceCents) / 1000),
      laminationCents: item.id === "glass"
        ? Math.round((scaledQuantity * laminationPriceCents) / 1000)
        : 0,
    };
  });
  const standardTotalCents = lines.reduce((total, line) => total + line.totalCents, otherCents + steelCents);
  const laminationCents = lines.reduce((total, line) => total + line.laminationCents, 0);

  return {
    lines,
    valid: otherValid && steelValid && lines.every((line) => line.valid),
    otherValid,
    otherCents,
    steelValid,
    steelCents,
    standardTotalCents,
    laminationCents,
    laminatedTotalCents: standardTotalCents + laminationCents,
  };
}

export function skylightMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
