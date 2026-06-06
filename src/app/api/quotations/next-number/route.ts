import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey } from "@/lib/supabase/config";

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
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Authentication is required." },
      { status: 401 },
    );
  }

  const year = new Date().getFullYear();
  const prefix = `Q-${year}-`;
  const queryClient = hasSupabaseServiceRoleKey()
    ? createAdminClient()
    : supabase;
  const { data, error } = await queryClient
    .from("quotations")
    .select("quotation_number")
    .like("quotation_number", `${prefix}%`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
