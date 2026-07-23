import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";
import { discountLimitForRoleFromSettings } from "@/lib/pricing/discountPolicyServer";
import { friendlyDatabaseError, isDuplicateError } from "@/lib/friendlyErrors";
import { canViewSalesPrices, normalizeAppRole } from "@/lib/auth/roles";
import type { AppRole } from "@/lib/auth/roles";

const duplicateQuotationNumberMessage =
  "This quotation number already exists. Please try saving again.";
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type QuotationItemPayload = {
  opening_id?: unknown;
  opening_code?: unknown;
  floor?: unknown;
  room?: unknown;
  width?: unknown;
  height?: unknown;
  solid_panel_height?: unknown;
  quantity?: unknown;
  product_system?: unknown;
  glass_type?: unknown;
  aluminum_color?: unknown;
  unit_price?: unknown;
  discount_percent?: unknown;
  line_type?: unknown;
  is_discountable?: unknown;
  notes?: unknown;
};

type SaveQuotationPayload = {
  id?: unknown;
  project_id?: unknown;
  client_id?: unknown;
  quotation_discount_percent?: unknown;
  subtotal?: unknown;
  line_discount_total?: unknown;
  quotation_discount_total?: unknown;
  grand_total?: unknown;
  notes?: unknown;
  prepared_by_text?: unknown;
  client_representative?: unknown;
  items?: unknown;
};

type SupabaseErrorDetails = {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

async function requireQuotationUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false as const, error: "Authentication is required." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    logQuotationError("profile-check", profileError);
    return { ok: false as const, error: "Unable to verify permissions." };
  }

  const role =
    user.email?.toLowerCase() === "admin@alumex.com"
      ? "Admin"
      : normalizeAppRole(profile?.role);

  if (profile?.is_active === false || !canViewSalesPrices(role)) {
    return {
      ok: false as const,
      error: "You do not have permission to complete this action.",
    };
  }

  return { ok: true as const, user, role };
}

function discountLimitError(role: AppRole | null, limit: number) {
  return `${role ?? "This role"} can add a maximum discount of ${limit}%.`;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  const text = textValue(value);
  return text || null;
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function integerValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isInteger(number) ? number : 0;
}

function lineTypeValue(value: unknown) {
  return value === "service" || value === "addon" || value === "accessory"
    ? value
    : "base";
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function nullableUuid(value: unknown) {
  return typeof value === "string" && uuidPattern.test(value) ? value : null;
}

function logQuotationError(operation: string, error: unknown) {
  console.error("[api/quotations] Supabase error", {
    route: "/api/quotations",
    operation,
    table: "public.quotations",
    client: "createAdminClient",
    executingRole: "service_role",
    error,
  });
}

function readApiError(error: unknown, fallback: string) {
  return friendlyDatabaseError(
    error,
    fallback,
    duplicateQuotationNumberMessage,
  );
}

function getSupabaseErrorDetails(error: unknown): SupabaseErrorDetails {
  if (error instanceof Error) {
    return { message: error.message };
  }

  if (!error || typeof error !== "object") {
    return { message: "Unknown database error." };
  }

  const errorRecord = error as Record<string, unknown>;

  return {
    message:
      typeof errorRecord.message === "string"
        ? errorRecord.message
        : undefined,
    code:
      typeof errorRecord.code === "string"
        ? errorRecord.code
        : undefined,
    details:
      typeof errorRecord.details === "string" || errorRecord.details === null
        ? errorRecord.details
        : undefined,
    hint:
      typeof errorRecord.hint === "string" || errorRecord.hint === null
        ? errorRecord.hint
        : undefined,
  };
}

function isMissingColumnError(error: unknown) {
  const details = getSupabaseErrorDetails(error);
  const message = `${details.message ?? ""} ${details.details ?? ""} ${details.hint ?? ""}`;

  return (
    details.code === "42703" ||
    details.code === "PGRST204" ||
    message.includes("line_type") ||
    message.includes("is_discountable")
  );
}

function quotationErrorResponse(
  error: unknown,
  fallback: string,
  status: number,
) {
  const friendlyMessage = readApiError(error, fallback);
  const errorDetails = getSupabaseErrorDetails(error);

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: friendlyMessage }, { status });
  }

  return NextResponse.json(
    {
      error: errorDetails.message ?? friendlyMessage,
      code: errorDetails.code,
      details: errorDetails.details,
      hint: errorDetails.hint,
    },
    { status },
  );
}

function mapItems(items: unknown) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item) => {
    const row = item as QuotationItemPayload;

    const lineType = lineTypeValue(row.line_type);
    const isDiscountable = booleanValue(
      row.is_discountable,
      lineType === "base",
    );

    return {
      opening_id: nullableUuid(row.opening_id),
      opening_code: textValue(row.opening_code),
      floor: nullableText(row.floor),
      room: nullableText(row.room),
      width: numberValue(row.width),
      height: numberValue(row.height),
      solid_panel_height: Math.min(
        Math.max(numberValue(row.solid_panel_height), 0),
        numberValue(row.height),
      ),
      quantity: integerValue(row.quantity),
      product_system: nullableText(row.product_system),
      glass_type: nullableText(row.glass_type),
      aluminum_color: nullableText(row.aluminum_color),
      unit_price: numberValue(row.unit_price),
      discount_percent: isDiscountable ? numberValue(row.discount_percent) : 0,
      line_type: lineType,
      is_discountable: isDiscountable,
      notes: nullableText(row.notes),
    };
  });
}

function pricingSourceForItems(items: ReturnType<typeof mapItems>) {
  return items.some((item) =>
    (item.notes ?? "").toLowerCase().includes("price source: project costing"),
  )
    ? "project_costing"
    : "catalog";
}

export async function GET() {
  const authCheck = await requireQuotationUser();

  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.error }, { status: 401 });
  }

  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: supabaseServiceRoleError },
      { status: 500 },
    );
  }

  const admin = createAdminClient();
  const [{ data: quotations, error: quotationsError }, itemsResult] =
    await Promise.all([
    admin
      .from("quotations")
      .select(
        "id, quotation_number, project_id, quotation_discount_percent, pricing_source, notes, prepared_by_text, client_representative, created_at",
      )
      .order("created_at", { ascending: false }),
    admin
      .from("quotation_items")
      .select(
        "id, quotation_id, opening_id, opening_code, floor, room, width, height, solid_panel_height, quantity, product_system, glass_type, aluminum_color, unit_price, discount_percent, line_type, is_discountable, notes",
      ),
  ]);

  if (quotationsError) {
    logQuotationError("select-quotations", quotationsError);
    return NextResponse.json(
      { error: readApiError(quotationsError, "Unable to load quotations.") },
      { status: 500 },
    );
  }

  let items = itemsResult.data as unknown[] | null;
  if (itemsResult.error && isMissingColumnError(itemsResult.error)) {
    const fallbackItemsResult = await admin
      .from("quotation_items")
      .select(
        "id, quotation_id, opening_id, opening_code, floor, room, width, height, quantity, product_system, glass_type, aluminum_color, unit_price, discount_percent, notes",
      );

    items = fallbackItemsResult.data as unknown[] | null;

    if (fallbackItemsResult.error) {
      logQuotationError("select-quotation-items", fallbackItemsResult.error);
      return NextResponse.json(
        {
          error: readApiError(
            fallbackItemsResult.error,
            "Unable to load quotation items.",
          ),
        },
        { status: 500 },
      );
    }
  } else if (itemsResult.error) {
    logQuotationError("select-quotation-items", itemsResult.error);
    return NextResponse.json(
      { error: readApiError(itemsResult.error, "Unable to load quotation items.") },
      { status: 500 },
    );
  }

  return NextResponse.json({
    quotations: quotations ?? [],
    items: items ?? [],
  });
}

export async function POST(request: Request) {
  const authCheck = await requireQuotationUser();

  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.error }, { status: 401 });
  }

  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: supabaseServiceRoleError },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as SaveQuotationPayload | null;
  const items = mapItems(body?.items);

  if (
    !body ||
    typeof body.project_id !== "string" ||
    !uuidPattern.test(body.project_id) ||
    typeof body.client_id !== "string" ||
    !uuidPattern.test(body.client_id) ||
    items.length === 0 ||
    items.some((item) => !item.opening_code || item.width < 0 || item.height < 0 || item.quantity <= 0)
  ) {
    return NextResponse.json(
      { error: "A valid quotation payload is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const pricingSource = pricingSourceForItems(items);
  const discountLimit = await discountLimitForRoleFromSettings(
    authCheck.role,
    admin,
  );
  const hasInvalidDiscount =
    numberValue(body.quotation_discount_percent) > discountLimit ||
    items.some((item) => item.is_discountable && item.discount_percent > discountLimit);

  if (hasInvalidDiscount) {
    return NextResponse.json(
      { error: discountLimitError(authCheck.role, discountLimit) },
      { status: 400 },
    );
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    let rpcResult:
      | Awaited<ReturnType<typeof admin.rpc<"save_quotation_with_items">>>
      | null = null;

    try {
      rpcResult = await admin.rpc("save_quotation_with_items", {
        p_quotation_id: null,
        p_project_id: body.project_id,
        p_client_id: body.client_id,
        p_quotation_discount_percent: numberValue(body.quotation_discount_percent),
        p_subtotal: numberValue(body.subtotal),
        p_line_discount_total: numberValue(body.line_discount_total),
        p_quotation_discount_total: numberValue(body.quotation_discount_total),
        p_grand_total: numberValue(body.grand_total),
        p_notes: nullableText(body.notes),
        p_prepared_by_text: nullableText(body.prepared_by_text),
        p_client_representative: nullableText(body.client_representative),
        p_created_by: authCheck.user.id,
        p_items: items,
      });
    } catch (rpcError) {
      console.error("[api/quotations] save_quotation_with_items threw", {
        route: "/api/quotations",
        operation: "save-rpc-create",
        rpc: "public.save_quotation_with_items",
        client: "createAdminClient",
        executingRole: "service_role",
        error: rpcError,
      });

      return quotationErrorResponse(rpcError, "Unable to save quotation.", 500);
    }

    const { data, error } = rpcResult;

    if (!error && Array.isArray(data) && data[0]) {
      const { error: sourceError } = await admin
        .from("quotations")
        .update({ pricing_source: pricingSource })
        .eq("id", data[0].id);

      if (sourceError) {
        return quotationErrorResponse(
          sourceError,
          "Quotation was saved, but its pricing source could not be recorded.",
          500,
        );
      }

      const { error: workflowError } = await admin
        .from("projects")
        .update({ workflow_status: "sales_quotation_created" })
        .eq("id", body.project_id)
        .eq("workflow_status", "sales_client_created");

      if (workflowError) {
        logQuotationError("workflow-update", workflowError);
        return quotationErrorResponse(
          workflowError,
          "Quotation was saved, but the project workflow could not be updated.",
          500,
        );
      }

      return NextResponse.json({ quotation: data[0] }, { status: 201 });
    }

    if (isDuplicateError(error)) {
      continue;
    }

    if (error) {
      console.error("[api/quotations] save_quotation_with_items returned error", {
        route: "/api/quotations",
        operation: "save-rpc-create",
        rpc: "public.save_quotation_with_items",
        client: "createAdminClient",
        executingRole: "service_role",
        error,
      });
      logQuotationError("save-rpc-create", error);
      return quotationErrorResponse(error, "Unable to save quotation.", 500);
    }
  }

  return NextResponse.json(
    { error: duplicateQuotationNumberMessage },
    { status: 409 },
  );
}

export async function PATCH(request: Request) {
  const authCheck = await requireQuotationUser();

  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.error }, { status: 401 });
  }

  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: supabaseServiceRoleError },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as SaveQuotationPayload | null;
  const items = mapItems(body?.items);

  if (
    !body ||
    typeof body.id !== "string" ||
    !uuidPattern.test(body.id) ||
    typeof body.project_id !== "string" ||
    !uuidPattern.test(body.project_id) ||
    typeof body.client_id !== "string" ||
    !uuidPattern.test(body.client_id) ||
    items.length === 0 ||
    items.some((item) => !item.opening_code || item.width < 0 || item.height < 0 || item.quantity <= 0)
  ) {
    return NextResponse.json(
      { error: "A valid quotation payload is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const pricingSource = pricingSourceForItems(items);
  const discountLimit = await discountLimitForRoleFromSettings(
    authCheck.role,
    admin,
  );
  const hasInvalidDiscount =
    numberValue(body.quotation_discount_percent) > discountLimit ||
    items.some((item) => item.is_discountable && item.discount_percent > discountLimit);

  if (hasInvalidDiscount) {
    return NextResponse.json(
      { error: discountLimitError(authCheck.role, discountLimit) },
      { status: 400 },
    );
  }

  const { data, error } = await admin.rpc("save_quotation_with_items", {
    p_quotation_id: body.id,
    p_project_id: body.project_id,
    p_client_id: body.client_id,
    p_quotation_discount_percent: numberValue(body.quotation_discount_percent),
    p_subtotal: numberValue(body.subtotal),
    p_line_discount_total: numberValue(body.line_discount_total),
    p_quotation_discount_total: numberValue(body.quotation_discount_total),
    p_grand_total: numberValue(body.grand_total),
    p_notes: nullableText(body.notes),
    p_prepared_by_text: nullableText(body.prepared_by_text),
    p_client_representative: nullableText(body.client_representative),
    p_created_by: authCheck.user.id,
    p_items: items,
  });

  if (error) {
    logQuotationError("save-rpc-update", error);
    return quotationErrorResponse(
      error,
      "Unable to save quotation.",
      isDuplicateError(error) ? 409 : 500,
    );
  }

  const quotation = Array.isArray(data) ? data[0] : null;

  if (!quotation) {
    return NextResponse.json(
      { error: "Quotation was not found." },
      { status: 404 },
    );
  }

  const { error: sourceError } = await admin
    .from("quotations")
    .update({ pricing_source: pricingSource })
    .eq("id", quotation.id);

  if (sourceError) {
    return quotationErrorResponse(
      sourceError,
      "Quotation was saved, but its pricing source could not be recorded.",
      500,
    );
  }

  return NextResponse.json({ quotation: { ...quotation, pricing_source: pricingSource } });
}

export async function DELETE(request: Request) {
  const authCheck = await requireQuotationUser();

  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.error }, { status: 401 });
  }

  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: supabaseServiceRoleError },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const quotationId = searchParams.get("id") ?? "";

  if (!uuidPattern.test(quotationId)) {
    return NextResponse.json(
      { error: "A valid quotation id is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("quotations")
    .delete()
    .eq("id", quotationId)
    .select("id")
    .maybeSingle();

  if (error) {
    logQuotationError("delete", error);
    return NextResponse.json(
      { error: readApiError(error, "Unable to delete quotation.") },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Quotation was not deleted. It may already have been removed." },
      { status: 404 },
    );
  }

  return NextResponse.json({ quotation: data });
}
