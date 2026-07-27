import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey } from "@/lib/supabase/config";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";

const quotationRoles = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Sales Rep",
  "Branch Manager",
] as const;

function formatQuotationNumber(year: number, sequence: number) {
  return `Q-${year}-${sequence.toString().padStart(4, "0")}`;
}

function nextQuotationNumber(quotationNumbers: string[], year: number) {
  const prefix = `Q-${year}-`;
  const highestSequence = quotationNumbers.reduce((highest, quotationNumber) => {
    if (!quotationNumber.startsWith(prefix)) {
      return highest;
    }

    const sequence = Number(quotationNumber.slice(prefix.length));
    return Number.isFinite(sequence) ? Math.max(highest, sequence) : highest;
  }, 0);

  return formatQuotationNumber(year, highestSequence + 1);
}

export async function GET() {
  const authCheck = await requireRole(quotationRoles);

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  const year = new Date().getFullYear();
  const prefix = `Q-${year}-`;
  const queryClient = hasSupabaseServiceRoleKey()
    ? createAdminClient()
    : null;

  if (!queryClient) {
    return NextResponse.json(
      { error: "Missing SUPABASE_SERVICE_ROLE_KEY. Add it on the server to enable quotation numbering." },
      { status: 500 },
    );
  }

  const { data, error } = await queryClient
    .from("quotations")
    .select("quotation_number")
    .like("quotation_number", `${prefix}%`);

  if (error) {
    return NextResponse.json(
      { error: friendlyDatabaseError(error, "Unable to generate quotation number.") },
      { status: 500 },
    );
  }

  const quotationNumbers = ((data ?? []) as Array<{ quotation_number: string | null }>)
    .map((quotation) => quotation.quotation_number)
    .filter((quotationNumber): quotationNumber is string =>
      Boolean(quotationNumber),
    );

  return NextResponse.json({
    quotationNumber: nextQuotationNumber(quotationNumbers, year),
  });
}
