import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

type SupabaseError = {
  code?: string;
  details?: string | null;
  hint?: string | null;
  message?: string;
};

function formatContractNumber(year: number, sequence: number) {
  return `CT-${year}-${sequence.toString().padStart(4, "0")}`;
}

function nextContractNumber(contractNumbers: string[], year: number) {
  const prefix = `CT-${year}-`;
  const highestSequence = contractNumbers.reduce((highest, contractNumber) => {
    if (!contractNumber.startsWith(prefix)) {
      return highest;
    }

    const sequence = Number(contractNumber.slice(prefix.length));
    return Number.isFinite(sequence) ? Math.max(highest, sequence) : highest;
  }, 0);

  return formatContractNumber(year, highestSequence + 1);
}

async function generateNextContractNumber(admin: ReturnType<typeof createAdminClient>) {
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

  return nextContractNumber(contractNumbers, year);
}

function logContractSupabaseError(
  operation: "select" | "insert" | "next-number",
  error: SupabaseError | null | undefined,
) {
  console.error("[api/contracts] Supabase error", {
    route: "/api/contracts",
    operation,
    table: "public.contracts",
    client: "createAdminClient",
    executingRole: "service_role",
    error,
  });
}

function contractError(error: SupabaseError | null | undefined) {
  return error?.message ?? "Unable to load contracts.";
}

async function requireAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false as const, error: "Authentication is required." };
  }

  return { ok: true as const, user };
}

export async function GET() {
  const authCheck = await requireAuthenticatedUser();

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
  const { data, error } = await admin
    .from("contracts")
    .select(
      "id, contract_number, project_id, quotation_id, client_id, status, contract_value, contract_date, payment_terms, warranty_terms, execution_terms, contract_terms, first_party_obligations, second_party_obligations, prepared_by_text, language, notes, created_by, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    logContractSupabaseError("select", error);
    return NextResponse.json({ error: contractError(error) }, { status: 500 });
  }

  return NextResponse.json({ contracts: data ?? [] });
}

export async function POST(request: Request) {
  const authCheck = await requireAuthenticatedUser();

  if (!authCheck.ok) {
    return NextResponse.json({ error: authCheck.error }, { status: 401 });
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

  for (let attempt = 0; attempt < 10; attempt += 1) {
    let contractNumber: string;

    try {
      contractNumber = await generateNextContractNumber(admin);
    } catch (nextNumberError) {
      logContractSupabaseError("next-number", nextNumberError as SupabaseError);
      return NextResponse.json(
        {
          error:
            nextNumberError instanceof Error
              ? nextNumberError.message
              : "Unable to generate contract number.",
        },
        { status: 500 },
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
      return NextResponse.json({ contract: data }, { status: 201 });
    }

    if (error?.code !== "23505") {
      logContractSupabaseError("insert", error);
      return NextResponse.json(
        { error: contractError(error) },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { error: "Unable to generate a unique contract number." },
    { status: 500 },
  );
}
