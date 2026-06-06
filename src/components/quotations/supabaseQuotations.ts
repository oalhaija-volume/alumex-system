import type { Project } from "@/data/ui";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { QuotationDraft, QuotationLine } from "@/components/quotations/quotationTypes";

type QuotationRow = {
  id: string;
  quotation_number: string;
  project_id: string;
  quotation_discount_percent: number | string;
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
  quantity: number;
  product_system: string | null;
  glass_type: string | null;
  aluminum_color: string | null;
  unit_price: number | string;
  discount_percent: number | string;
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
    quantity: item.quantity,
    productSystem: item.product_system ?? "",
    glassType: item.glass_type ?? "",
    aluminumColor: item.aluminum_color ?? "",
    notes: item.notes ?? "",
    unitPrice: numberValue(item.unit_price),
    discountPercent: numberValue(item.discount_percent),
  };
}

export async function loadSupabaseQuotations(
  projects: Project[],
): Promise<QuotationDraft[]> {
  const supabase = createSupabaseClient();
  const [{ data: quotationRows, error: quotationsError }, { data: itemRows, error: itemsError }] =
    await Promise.all([
      supabase
        .from("quotations")
        .select(
          "id, quotation_number, project_id, quotation_discount_percent, notes, prepared_by_text, client_representative, created_at",
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("quotation_items")
        .select(
          "id, quotation_id, opening_id, opening_code, floor, room, width, height, quantity, product_system, glass_type, aluminum_color, unit_price, discount_percent, notes",
        ),
    ]);

  if (quotationsError) {
    throw quotationsError;
  }

  if (itemsError) {
    throw itemsError;
  }

  const itemsByQuotation = new Map<string, QuotationLine[]>();
  ((itemRows ?? []) as QuotationItemRow[]).forEach((item) => {
    const list = itemsByQuotation.get(item.quotation_id) ?? [];
    list.push(mapLine(item));
    itemsByQuotation.set(item.quotation_id, list);
  });

  return ((quotationRows ?? []) as QuotationRow[]).reduce<QuotationDraft[]>(
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
        savedAt: quotation.created_at,
      });

      return quotations;
    },
    [],
  );
}

export async function deleteSupabaseQuotation(id: string) {
  const supabase = createSupabaseClient();
  const { error } = await supabase.from("quotations").delete().eq("id", id);

  if (error) {
    throw error;
  }
}
