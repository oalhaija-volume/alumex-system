import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";
import { generateNextContractNumber } from "@/lib/contracts/numbering";

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
    console.error("[api/contracts/next-number] Supabase error", {
      route: "/api/contracts/next-number",
      operation: "select",
      table: "public.contracts",
      client: "createAdminClient",
      executingRole: "service_role",
      error,
    });

    return NextResponse.json({ error: error.message }, { status: 500 });
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
