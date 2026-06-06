import type { Project, StructuralOpening } from "@/data/ui";

export type QuotationLine = StructuralOpening & {
  unitPrice: number;
  discountPercent: number;
};

export type QuotationDraft = {
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
};

export const quotationStorageKey = "alumex-current-quotation";
export const savedQuotationsStorageKey = "alumex-local-quotations";

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
  const discount = gross * (line.discountPercent / 100);

  return {
    area: calculateArea(line),
    gross,
    discount,
    net: gross - discount,
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
  const afterLineDiscounts = subtotal - lineDiscountTotal;
  const quotationDiscount = afterLineDiscounts * (discountPercent / 100);
  const totalArea = lineTotals.reduce((sum, line) => sum + line.area, 0);

  return {
    subtotal,
    lineDiscountTotal,
    afterLineDiscounts,
    quotationDiscount,
    grandTotal: afterLineDiscounts - quotationDiscount,
    totalArea,
  };
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}
