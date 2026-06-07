import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth/adminServer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

type TemplatePayload = {
  payment_terms?: unknown;
  warranty_terms?: unknown;
  execution_terms?: unknown;
  contract_terms?: unknown;
  first_party_obligations?: unknown;
  second_party_obligations?: unknown;
};

const templateSelect =
  "payment_terms, warranty_terms, execution_terms, contract_terms, first_party_obligations, second_party_obligations";

function logTemplateError(operation: "select" | "update", error: unknown) {
  console.error("[api/contracts/template] Supabase error", {
    route: "/api/contracts/template",
    operation,
    table: "public.contract_templates",
    client: "createAdminClient",
    executingRole: "service_role",
    error,
  });
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
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
    .from("contract_templates")
    .select(templateSelect)
    .eq("id", "default")
    .maybeSingle();

  if (error) {
    logTemplateError("select", error);
    return NextResponse.json(
      { error: error.message ?? "Unable to load contract template." },
      { status: 500 },
    );
  }

  return NextResponse.json({ template: data });
}

export async function PUT(request: Request) {
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

  const body = (await request.json().catch(() => null)) as TemplatePayload | null;

  if (!body) {
    return NextResponse.json(
      { error: "Contract template payload is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("contract_templates")
    .upsert(
      {
        id: "default",
        payment_terms: textValue(body.payment_terms),
        warranty_terms: textValue(body.warranty_terms),
        execution_terms: textValue(body.execution_terms),
        contract_terms: textValue(body.contract_terms),
        first_party_obligations: textValue(body.first_party_obligations),
        second_party_obligations: textValue(body.second_party_obligations),
      },
      { onConflict: "id" },
    )
    .select(templateSelect)
    .single();

  if (error) {
    logTemplateError("update", error);
    return NextResponse.json(
      { error: error.message ?? "Unable to save contract template." },
      { status: 500 },
    );
  }

  return NextResponse.json({ template: data });
}
