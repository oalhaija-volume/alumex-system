import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";
import { generateNextContractNumber } from "@/lib/contracts/numbering";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";

const contractRoles = [
  "Admin",
  "Sales Manager",
  "Sales Rep",
  "Finance / Accountant",
] as const;

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

function contractNumberErrorResponse(error: unknown) {
  const friendlyMessage = friendlyDatabaseError(
    error,
    "Unable to generate contract number.",
  );
  const errorDetails = getSupabaseErrorDetails(error);

  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: friendlyMessage }, { status: 500 });
  }

  return NextResponse.json(
    {
      error: errorDetails.message ?? friendlyMessage,
      code: errorDetails.code,
      details: errorDetails.details,
      hint: errorDetails.hint,
    },
    { status: 500 },
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

  const year = new Date().getFullYear();
  const prefix = `CT-${year}-`;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("contracts")
    .select("contract_number")
    .like("contract_number", `${prefix}%`);

  if (error) {
    const errorDetails = getSupabaseErrorDetails(error);

    console.error("[api/contracts/next-number] Supabase error", {
      route: "/api/contracts/next-number",
      operation: "select",
      table: "public.contracts",
      client: "createAdminClient",
      executingRole: "service_role",
      error: errorDetails,
      rawError: error,
    });

    return contractNumberErrorResponse(error);
  }

  const contractNumbers = ((data ?? []) as Array<{ contract_number: string | null }>)
    .map((contract) => contract.contract_number)
    .filter((contractNumber): contractNumber is string =>
      Boolean(contractNumber),
    );

  return NextResponse.json({
    contractNumber: generateNextContractNumber({ contractNumbers, year }),
  });
}
