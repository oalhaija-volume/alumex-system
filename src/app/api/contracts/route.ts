import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

const contractsPermissionError =
  "Unable to access contracts table. Check Supabase permissions.";

function contractError(error: { message?: string } | null | undefined) {
  if (error?.message?.toLowerCase().includes("permission denied")) {
    return contractsPermissionError;
  }

  return error?.message ?? contractsPermissionError;
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
      "id, contract_number, project_id, quotation_id, client_id, status, contract_value, contract_date, payment_terms, warranty_terms, execution_terms, prepared_by_text, language, notes, created_by, created_at, updated_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
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
  const { data, error } = await admin
    .from("contracts")
    .insert({
      contract_number: body.contract_number,
      project_id: body.project_id,
      quotation_id: body.quotation_id ?? null,
      client_id: body.client_id,
      status: body.status ?? "Draft",
      contract_value: body.contract_value ?? 0,
      contract_date: body.contract_date ?? null,
      payment_terms: body.payment_terms ?? null,
      warranty_terms: body.warranty_terms ?? null,
      execution_terms: body.execution_terms ?? null,
      prepared_by_text: body.prepared_by_text ?? null,
      language: body.language ?? "ar",
      notes: body.notes ?? null,
      created_by: authCheck.user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: contractError(error) },
      { status: 500 },
    );
  }

  return NextResponse.json({ contract: data }, { status: 201 });
}
