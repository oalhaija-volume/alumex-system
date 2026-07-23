import type { Project } from "@/data/ui";
import type { QuotationDraft, QuotationLine } from "@/components/quotations/quotationTypes";

type QuotationRow = {
  id: string;
  quotation_number: string;
  project_id: string;
  quotation_discount_percent: number | string;
  pricing_source: "catalog" | "project_costing";
  notes: string | null;
  prepared_by_text: string | null;
  client_representative: string | null;
  created_at: string;
};

type QuotationItemRow = {
  id: string;
  quotation_id: string;
  opening_id: string | null;
  opening_code: string;
  floor: string | null;
  room: string | null;
  width: number | string;
  height: number | string;
  solid_panel_height?: number | string | null;
  quantity: number;
  product_system: string | null;
  glass_type: string | null;
  aluminum_color: string | null;
  unit_price: number | string;
  discount_percent: number | string;
  line_type?: "base" | "service" | "addon" | "accessory" | null;
  is_discountable?: boolean | null;
  notes: string | null;
};

function numberValue(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function mapLine(item: QuotationItemRow): QuotationLine {
  return {
    id: item.opening_id ?? item.id,
    floor: item.floor ?? "",
    room: item.room ?? "",
    openingCode: item.opening_code,
    width: numberValue(item.width),
    height: numberValue(item.height),
    solidPanelHeight: numberValue(item.solid_panel_height),
    quantity: item.quantity,
    productSystem: item.product_system ?? "",
    glassType: item.glass_type ?? "",
    aluminumColor: item.aluminum_color ?? "",
    notes: item.notes ?? "",
    unitPrice: numberValue(item.unit_price),
    discountPercent: item.is_discountable === false ? 0 : numberValue(item.discount_percent),
    lineType: item.line_type ?? "base",
    isDiscountable:
      item.is_discountable ??
      !["addon", "accessory"].includes(item.line_type ?? "base"),
  };
}

export async function loadSupabaseQuotations(
  projects: Project[],
): Promise<QuotationDraft[]> {
  const response = await fetch("/api/quotations", { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as {
    quotations?: QuotationRow[];
    items?: QuotationItemRow[];
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(body?.error ?? "Unable to load quotations.");
  }

  const itemsByQuotation = new Map<string, QuotationLine[]>();
  (body?.items ?? []).forEach((item) => {
    const list = itemsByQuotation.get(item.quotation_id) ?? [];
    list.push(mapLine(item));
    itemsByQuotation.set(item.quotation_id, list);
  });

  return (body?.quotations ?? []).reduce<QuotationDraft[]>(
    (quotations, quotation) => {
      const project = projects.find((item) => item.id === quotation.project_id);

      if (!project) {
        return quotations;
      }

      quotations.push({
        id: quotation.id,
        quotationNumber: quotation.quotation_number,
        project,
        lines: itemsByQuotation.get(quotation.id) ?? [],
        discountPercent: numberValue(quotation.quotation_discount_percent),
        notes: quotation.notes ?? "",
        preparedBy: quotation.prepared_by_text ?? "",
        clientRepresentative: quotation.client_representative ?? "",
        pricingSource: quotation.pricing_source,
        savedAt: quotation.created_at,
      });

      return quotations;
    },
    [],
  );
}

export async function deleteSupabaseQuotation(id: string) {
  const response = await fetch(`/api/quotations?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(
      body?.error ?? "Quotation was not deleted. It may already have been removed.",
    );
  }
}
