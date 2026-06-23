import type { Project, StructuralOpening } from "@/data/ui";

export type QuotationLine = StructuralOpening & {
  unitPrice: number;
  discountPercent: number;
  lineType?: "base" | "addon" | "accessory";
  isDiscountable?: boolean;
};

export type QuotationDraft = {
  id?: string;
  quotationNumber: string;
  project: Project;
  lines: QuotationLine[];
  discountPercent: number;
  notes: string;
  preparedBy: string;
  clientRepresentative: string;
  savedAt?: string;
};

export type QuotationTotals = {
  subtotal: number;
  lineDiscountTotal: number;
  afterLineDiscounts: number;
  quotationDiscount: number;
  grandTotal: number;
  totalArea: number;
  discountableSubtotal: number;
  nonDiscountableSubtotal: number;
};

export const quotationStorageKey = "alumex-current-quotation";

export function calculateArea(opening: {
  width: number;
  height: number;
  quantity: number;
}) {
  const widthMeters = opening.width / 100;
  const heightMeters = opening.height / 100;

  return Math.max(widthMeters * heightMeters * opening.quantity, 1);
}

export function calculateLineTotal(line: QuotationLine) {
  const gross = calculateArea(line) * line.unitPrice;
  const isDiscountable =
    line.isDiscountable ?? !["addon", "accessory"].includes(line.lineType ?? "base");
  const discount = isDiscountable ? gross * (line.discountPercent / 100) : 0;

  return {
    area: calculateArea(line),
    gross,
    discount,
    net: gross - discount,
    isDiscountable,
  };
}

export function calculateQuotationTotals(
  lines: QuotationLine[],
  discountPercent: number,
): QuotationTotals {
  const lineTotals = lines.map(calculateLineTotal);
  const subtotal = lineTotals.reduce((sum, line) => sum + line.gross, 0);
  const lineDiscountTotal = lineTotals.reduce(
    (sum, line) => sum + line.discount,
    0,
  );
  const discountableAfterLineDiscounts = lineTotals.reduce(
    (sum, line) => sum + (line.isDiscountable ? line.net : 0),
    0,
  );
  const nonDiscountableSubtotal = lineTotals.reduce(
    (sum, line) => sum + (line.isDiscountable ? 0 : line.net),
    0,
  );
  const afterLineDiscounts = discountableAfterLineDiscounts + nonDiscountableSubtotal;
  const quotationDiscount =
    discountableAfterLineDiscounts * (discountPercent / 100);
  const totalArea = lineTotals.reduce((sum, line) => sum + line.area, 0);

  return {
    subtotal,
    lineDiscountTotal,
    afterLineDiscounts,
    quotationDiscount,
    grandTotal:
      discountableAfterLineDiscounts - quotationDiscount + nonDiscountableSubtotal,
    totalArea,
    discountableSubtotal: discountableAfterLineDiscounts,
    nonDiscountableSubtotal,
  };
}

export function formatCurrency(value: number) {
  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);

  return `IQD ${formatted}`;
}
