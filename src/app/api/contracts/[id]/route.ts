import { NextResponse } from "next/server";
import { requireAdminUser, requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";

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

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeContractNumber(value: unknown) {
  return textValue(value).toLowerCase();
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authCheck = await requireRole(["Admin"]);

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
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body) {
    return NextResponse.json(
      { error: "Contract update payload is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
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

  const { data, error } = await admin
    .from("contracts")
    .update({
      contract_number: textValue(body.contract_number),
      project_id: body.project_id,
      quotation_id: body.quotation_id ?? null,
      client_id: body.client_id,
      status: body.status,
      contract_value: body.contract_value,
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
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
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
  const adminCheck = await requireAdminUser();

  if (!adminCheck.ok) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status },
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
