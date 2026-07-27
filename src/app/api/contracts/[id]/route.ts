import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";
import { discountLimitForRoleFromSettings } from "@/lib/pricing/discountPolicyServer";

type SupabaseError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

function logContractSupabaseError(
  route: "/api/contracts/[id]",
  operation: "update" | "delete",
  error: SupabaseError | null | undefined,
) {
  const errorDetails = getSupabaseErrorDetails(error);

  console.error("[api/contracts/[id]] Supabase error", {
    route,
    operation,
    table: "public.contracts",
    client: "createAdminClient",
    executingRole: "service_role",
    error: errorDetails,
    rawError: error,
  });
}

function contractError(error: SupabaseError | null | undefined) {
  return friendlyDatabaseError(error, "Unable to update contract.");
}

function getSupabaseErrorDetails(error: unknown) {
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

function contractErrorResponse(
  error: unknown,
  fallback: string,
  status: number,
) {
  const friendlyMessage = friendlyDatabaseError(error, fallback);
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

function isMissingSignatureColumnError(error: unknown) {
  const details = getSupabaseErrorDetails(error);
  const message = details.message ?? "";
  const combinedMessage = [
    details.message,
    details.details,
    details.hint,
  ]
    .filter(Boolean)
    .join(" ");
  const hasSignatureColumnName =
    combinedMessage.includes("client_signature_data_url") ||
    combinedMessage.includes("client_signed_name") ||
    combinedMessage.includes("client_signed_at") ||
    combinedMessage.includes("sales_signature_data_url") ||
    combinedMessage.includes("sales_signed_name") ||
    combinedMessage.includes("sales_signed_at") ||
    combinedMessage.includes("signed_by_sales_user_id");

  return (
    hasSignatureColumnName &&
    (details.code === "42703" ||
      details.code === "PGRST204" ||
      message.toLowerCase().includes("schema cache"))
  );
}

function isMissingColumnError(error: unknown) {
  const details = getSupabaseErrorDetails(error);

  return details.code === "42703" || details.code === "PGRST204";
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function normalizeContractNumber(value: unknown) {
  return textValue(value).toLowerCase();
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const isSignatureUpdate = body?.action === "save-signatures";
  const authCheck = await requireRole(
    isSignatureUpdate
      ? ["Admin", "Sales Manager", "Indoor Sales", "Sales Rep"]
      : [
          "Admin",
          "Sales Manager",
          "Indoor Sales",
          "Sales Rep",
          "Branch Manager",
        ],
  );

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: supabaseServiceRoleError },
      { status: 500 },
    );
  }

  const { id } = await context.params;

  if (!body) {
    return NextResponse.json(
      { error: "Contract update payload is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  if (!isSignatureUpdate && body.contract_discount_percent !== undefined) {
    const discountLimit = await discountLimitForRoleFromSettings(
      authCheck.role,
      admin,
    );
    const contractDiscountPercent = numberValue(body.contract_discount_percent);

    if (contractDiscountPercent > discountLimit) {
      return NextResponse.json(
        {
          error: `${authCheck.role ?? "This role"} can add a maximum discount of ${discountLimit}%.`,
        },
        { status: 400 },
      );
    }
  }

  if (isSignatureUpdate) {
    const now = new Date().toISOString();
    const clientSignatureDataUrl = textValue(body.client_signature_data_url);
    const salesSignatureDataUrl = textValue(body.sales_signature_data_url);

    if (!clientSignatureDataUrl || !salesSignatureDataUrl) {
      return NextResponse.json(
        { error: "Client and sales signatures are required." },
        { status: 400 },
      );
    }

    const { data, error } = await admin.rpc(
      "sign_contract_and_create_handoff",
      {
        target_contract_id: id,
        client_signature: clientSignatureDataUrl,
        client_name: textValue(body.client_signed_name),
        client_signature_at: textValue(body.client_signed_at) || now,
        sales_signature: salesSignatureDataUrl,
        sales_name: textValue(body.sales_signed_name),
        sales_signature_at: textValue(body.sales_signed_at) || now,
        actor_user_id: authCheck.user.id,
      },
    );

    if (error) {
      if (isMissingSignatureColumnError(error)) {
        return NextResponse.json(
          {
            error:
              "Signature columns are missing in Supabase. Apply migration 20260616170000_contract_digital_signature.sql, then try again.",
          },
          { status: 409 },
        );
      }

      logContractSupabaseError("/api/contracts/[id]", "update", error);
      return contractErrorResponse(error, contractError(error), 500);
    }

    const result = Array.isArray(data) ? data[0] : null;

    if (!result) {
      return NextResponse.json(
        { error: "Contract was not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      contract: { id: result.contract_id },
      handoff: {
        id: result.handoff_id,
        status: result.handoff_status,
      },
    });
  }

  const normalizedContractNumber = normalizeContractNumber(body.contract_number);

  if (!normalizedContractNumber) {
    return NextResponse.json(
      { error: "Contract number is required." },
      { status: 400 },
    );
  }

  const { data: existingContracts, error: duplicateCheckError } = await admin
    .from("contracts")
    .select("id, contract_number")
    .neq("id", id);

  if (duplicateCheckError) {
    logContractSupabaseError(
      "/api/contracts/[id]",
      "update",
      duplicateCheckError,
    );
    return contractErrorResponse(
      duplicateCheckError,
      "Unable to verify contract number.",
      500,
    );
  }

  const duplicateContract = (existingContracts ?? []).some(
    (contract: { contract_number: string | null }) =>
      normalizeContractNumber(contract.contract_number) === normalizedContractNumber,
  );

  if (duplicateContract) {
    return NextResponse.json(
      { error: "This contract number already exists." },
      { status: 409 },
    );
  }

  const updatePayload = {
    contract_number: textValue(body.contract_number),
    project_id: body.project_id,
    quotation_id: body.quotation_id ?? null,
    quotation_version_id: body.quotation_version_id ?? null,
    client_id: body.client_id,
    status: body.status,
    contract_value: body.contract_value,
    pricing_source:
      body.pricing_source === "project_costing" ? "project_costing" : "catalog",
    source_contract_value:
      body.source_contract_value ?? body.contract_value ?? 0,
    contract_discount_percent: numberValue(body.contract_discount_percent),
    contract_discount_total: body.contract_discount_total ?? 0,
    contract_date: body.contract_date ?? null,
    payment_terms: body.payment_terms ?? null,
    warranty_terms: body.warranty_terms ?? null,
    execution_terms: body.execution_terms ?? null,
    contract_terms: body.contract_terms ?? null,
    first_party_obligations: body.first_party_obligations ?? null,
    second_party_obligations: body.second_party_obligations ?? null,
    prepared_by_text: body.prepared_by_text ?? null,
    language: body.language,
    notes: body.notes ?? null,
  };
  const fallbackUpdatePayload = {
    contract_number: updatePayload.contract_number,
    project_id: updatePayload.project_id,
    quotation_id: updatePayload.quotation_id,
    quotation_version_id: updatePayload.quotation_version_id,
    client_id: updatePayload.client_id,
    status: updatePayload.status,
    contract_value: updatePayload.contract_value,
    contract_date: updatePayload.contract_date,
    payment_terms: updatePayload.payment_terms,
    warranty_terms: updatePayload.warranty_terms,
    execution_terms: updatePayload.execution_terms,
    contract_terms: updatePayload.contract_terms,
    first_party_obligations: updatePayload.first_party_obligations,
    second_party_obligations: updatePayload.second_party_obligations,
    prepared_by_text: updatePayload.prepared_by_text,
    language: updatePayload.language,
    notes: updatePayload.notes,
  };

  const { data, error } = await admin
    .from("contracts")
    .update(updatePayload)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error)) {
      const { data: fallbackData, error: fallbackError } = await admin
        .from("contracts")
        .update(fallbackUpdatePayload)
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (!fallbackError) {
        if (!fallbackData) {
          return NextResponse.json(
            { error: "Contract was not found." },
            { status: 404 },
          );
        }

        return NextResponse.json({ contract: fallbackData });
      }

      logContractSupabaseError("/api/contracts/[id]", "update", fallbackError);
      return contractErrorResponse(fallbackError, contractError(fallbackError), 500);
    }

    logContractSupabaseError("/api/contracts/[id]", "update", error);
    return contractErrorResponse(error, contractError(error), 500);
  }

  if (!data) {
    return NextResponse.json(
      { error: "Contract was not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ contract: data });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authCheck = await requireRole([
    "Admin",
    "Sales Manager",
    "Indoor Sales",
    "Sales Rep",
  ]);

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  if (!hasSupabaseServiceRoleKey()) {
    return NextResponse.json(
      { error: supabaseServiceRoleError },
      { status: 500 },
    );
  }

  const { id } = await context.params;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("contracts")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    logContractSupabaseError("/api/contracts/[id]", "delete", error);
    return contractErrorResponse(error, "Unable to delete contract.", 500);
  }

  if (!data) {
    return NextResponse.json(
      { error: "Contract was not deleted. It may already have been removed." },
      { status: 404 },
    );
  }

  return NextResponse.json({ contract: data });
}
