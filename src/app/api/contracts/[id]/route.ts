import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/adminServer";
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

function logContractSupabaseError(
  route: "/api/contracts/[id]",
  operation: "update" | "delete",
  error: SupabaseError | null | undefined,
) {
  console.error("[api/contracts/[id]] Supabase error", {
    route,
    operation,
    table: "public.contracts",
    client: "createAdminClient",
    executingRole: "service_role",
    error,
  });
}

function contractError(error: SupabaseError | null | undefined) {
  return error?.message ?? "Unable to update contract.";
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
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

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body) {
    return NextResponse.json(
      { error: "Contract update payload is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("contracts")
    .update({
      contract_number: body.contract_number,
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
    .eq("id", id);

  if (error) {
    logContractSupabaseError("/api/contracts/[id]", "update", error);
    return NextResponse.json({ error: contractError(error) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
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
  const { error } = await admin.from("contracts").delete().eq("id", id);

  if (error) {
    logContractSupabaseError("/api/contracts/[id]", "delete", error);
    return NextResponse.json({ error: contractError(error) }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
