import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";
import { generateNextContractNumber } from "@/lib/contracts/numbering";
import { friendlyDatabaseError, isDuplicateError } from "@/lib/friendlyErrors";

type SupabaseError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

const duplicateContractNumberMessage =
  "This contract number already exists. A new contract number has been generated.";
const contractRoles = [
  "Admin",
  "Sales Manager",
  "Sales Rep",
  "Finance / Accountant",
] as const;

async function loadContractNumbers(admin: ReturnType<typeof createAdminClient>) {
  const year = new Date().getFullYear();
  const prefix = `CT-${year}-`;
  const { data, error } = await admin
    .from("contracts")
    .select("contract_number")
    .like("contract_number", `${prefix}%`);

  if (error) {
    throw error;
  }

  const contractNumbers = ((data ?? []) as Array<{ contract_number: string | null }>)
    .map((contract) => contract.contract_number)
    .filter((contractNumber): contractNumber is string =>
      Boolean(contractNumber),
    );

  return contractNumbers;
}

function logContractSupabaseError(
  operation: "select" | "insert" | "next-number" | "workflow-update" | "rollback",
  error: SupabaseError | null | undefined,
) {
  const errorDetails = getSupabaseErrorDetails(error);

  console.error("[api/contracts] Supabase error", {
    route: "/api/contracts",
    operation,
    table: "public.contracts",
    client: "createAdminClient",
    executingRole: "service_role",
    error: errorDetails,
    rawError: error,
  });
}

function contractError(error: SupabaseError | null | undefined) {
  return friendlyDatabaseError(
    error,
    "Unable to load contracts.",
    duplicateContractNumberMessage,
  );
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
  const friendlyMessage = friendlyDatabaseError(
    error,
    fallback,
    duplicateContractNumberMessage,
  );
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

export async function GET() {
  const authCheck = await requireRole(contractRoles);

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

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("contracts")
    .select(
      "id, contract_number, project_id, quotation_id, client_id, status, contract_value, contract_date, payment_terms, warranty_terms, execution_terms, contract_terms, first_party_obligations, second_party_obligations, prepared_by_text, language, notes, created_by, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    logContractSupabaseError("select", error);
    return contractErrorResponse(error, "Unable to load contracts.", 500);
  }

  return NextResponse.json({ contracts: data ?? [] });
}

export async function POST(request: Request) {
  const authCheck = await requireRole(contractRoles);

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

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body) {
    return NextResponse.json(
      { error: "Contract payload is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const collidedContractNumbers = new Set<string>();
  const contractPayload = {
    project_id: body.project_id,
    quotation_id: body.quotation_id ?? null,
    client_id: body.client_id,
    status: body.status ?? "Draft",
    contract_value: body.contract_value ?? 0,
    contract_date: body.contract_date ?? null,
    payment_terms: body.payment_terms ?? null,
    warranty_terms: body.warranty_terms ?? null,
    execution_terms: body.execution_terms ?? null,
    contract_terms: body.contract_terms ?? null,
    first_party_obligations: body.first_party_obligations ?? null,
    second_party_obligations: body.second_party_obligations ?? null,
    prepared_by_text: body.prepared_by_text ?? null,
    language: body.language ?? "ar",
    notes: body.notes ?? null,
    created_by: authCheck.user.id,
  };

  if (typeof contractPayload.quotation_id === "string") {
    const { data: existingQuotationContract, error: existingQuotationError } =
      await admin
        .from("contracts")
        .select("id, contract_number")
        .eq("quotation_id", contractPayload.quotation_id)
        .maybeSingle();

    if (existingQuotationError) {
      logContractSupabaseError("select", existingQuotationError);
      return contractErrorResponse(
        existingQuotationError,
        "Unable to verify existing contracts.",
        500,
      );
    }

    if (existingQuotationContract) {
      return NextResponse.json(
        {
          error: "This quotation already has a contract.",
          contract: existingQuotationContract,
        },
        { status: 409 },
      );
    }
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    let contractNumber: string;

    try {
      const contractNumbers = await loadContractNumbers(admin);
      contractNumber = generateNextContractNumber({
        contractNumbers,
        reservedNumbers: Array.from(collidedContractNumbers),
      });

      const { data: existingContract, error: existingError } = await admin
        .from("contracts")
        .select("id")
        .eq("contract_number", contractNumber)
        .maybeSingle();

      if (existingError) {
        throw existingError;
      }

      if (existingContract) {
        collidedContractNumbers.add(contractNumber);
        continue;
      }
    } catch (nextNumberError) {
      logContractSupabaseError("next-number", nextNumberError as SupabaseError);
      return contractErrorResponse(
        nextNumberError,
        "Unable to generate contract number.",
        500,
      );
    }

    const { data, error } = await admin
      .from("contracts")
      .insert({
        contract_number: contractNumber,
        ...contractPayload,
      })
      .select("id, contract_number")
      .single();

    if (!error && data) {
      const { error: workflowError } = await admin
        .from("projects")
        .update({ workflow_status: "finance_down_payment_pending" })
        .eq("id", contractPayload.project_id);

      if (workflowError) {
        logContractSupabaseError("workflow-update", workflowError);

        const { error: rollbackError } = await admin
          .from("contracts")
          .delete()
          .eq("id", data.id);

        if (rollbackError) {
          logContractSupabaseError("rollback", rollbackError);
        }

        return NextResponse.json(
          process.env.NODE_ENV === "production"
            ? {
                error: friendlyDatabaseError(
                  workflowError,
                  "Contract was not saved because the workflow status could not be updated.",
                ),
              }
            : {
                error:
                  getSupabaseErrorDetails(workflowError).message ??
                  "Contract was not saved because the workflow status could not be updated.",
                code: getSupabaseErrorDetails(workflowError).code,
                details: getSupabaseErrorDetails(workflowError).details,
                hint: getSupabaseErrorDetails(workflowError).hint,
              },
          { status: 500 },
        );
      }

      return NextResponse.json({ contract: data }, { status: 201 });
    }

    if (
      isDuplicateError(error)
    ) {
      collidedContractNumbers.add(contractNumber);
      continue;
    }

    if (error) {
      logContractSupabaseError("insert", error);
      return contractErrorResponse(error, contractError(error), 500);
    }
  }

  return NextResponse.json(
    { error: duplicateContractNumberMessage },
    { status: 500 },
  );
}
