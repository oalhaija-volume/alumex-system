import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";
import {
  canViewFinanceValues,
  normalizeAppRole,
  type AppRole,
} from "@/lib/auth/roles";

const seedAdminEmail = "admin@alumex.com";

type QuotationSourceRow = {
  id: string;
  quotation_number: string;
  project_id: string;
  client_id: string;
  grand_total: number | string;
  pricing_source: "catalog" | "project_costing";
  created_at: string;
};

type ProjectRow = {
  id: string;
  project_name: string;
};

type ClientRow = {
  id: string;
  client_name: string;
};

function numberValue(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function logContractSourceError(operation: string, error: unknown) {
  console.error("[api/quotations/contract-source] Supabase error", {
    route: "/api/quotations/contract-source",
    operation,
    client: "createAdminClient",
    executingRole: "service_role",
    error,
  });
}

async function requireContractSourceUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false as const,
      status: 401,
      error: "Authentication is required.",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, is_active, status")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    logContractSourceError("profile-check", profileError);
    return {
      ok: false as const,
      status: 500,
      error: "Unable to verify permissions.",
    };
  }

  const profileData = profile as {
    role: AppRole | "Sales User" | null;
    is_active: boolean | null;
    status?: string | null;
  } | null;
  const role =
    user.email?.toLowerCase() === seedAdminEmail
      ? "Admin"
      : normalizeAppRole(profileData?.role);
  const inactive =
    profileData?.is_active === false || profileData?.status === "Inactive";

  if (inactive || !canViewFinanceValues(role)) {
    return {
      ok: false as const,
      status: 403,
      error: "You do not have permission to complete this action.",
    };
  }

  return { ok: true as const };
}

export async function GET() {
  const authCheck = await requireContractSourceUser();

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

  try {
    const admin = createAdminClient();
    const [
      { data: quotations, error: quotationsError },
      { data: projects, error: projectsError },
      { data: clients, error: clientsError },
    ] = await Promise.all([
      admin
        .from("quotations")
        .select("id, quotation_number, project_id, client_id, grand_total, pricing_source, created_at")
        .order("created_at", { ascending: false }),
      admin.from("projects").select("id, project_name"),
      admin.from("clients").select("id, client_name"),
    ]);

    const firstError = quotationsError ?? projectsError ?? clientsError;

    if (firstError) {
      throw firstError;
    }

    const projectsById = new Map(
      ((projects ?? []) as ProjectRow[]).map((project) => [project.id, project]),
    );
    const clientsById = new Map(
      ((clients ?? []) as ClientRow[]).map((client) => [client.id, client]),
    );

    return NextResponse.json({
      quotations: ((quotations ?? []) as QuotationSourceRow[]).map((quotation) => ({
        id: quotation.id,
        quotationNumber: quotation.quotation_number,
        projectId: quotation.project_id,
        projectName: projectsById.get(quotation.project_id)?.project_name ?? "",
        clientId: quotation.client_id,
        clientName: clientsById.get(quotation.client_id)?.client_name ?? "",
        contractTotal: numberValue(quotation.grand_total),
        pricingSource: quotation.pricing_source,
      })),
    });
  } catch (error) {
    logContractSourceError("select-contract-sources", error);
    return NextResponse.json(
      { error: friendlyDatabaseError(error, "Unable to load contract sources.") },
      { status: 500 },
    );
  }
}
