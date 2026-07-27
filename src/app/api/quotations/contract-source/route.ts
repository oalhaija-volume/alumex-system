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
};

type ApprovedVersionRow = {
  id: string;
  quotation_id: string;
  version_number: number;
  status: string;
  grand_total: number | string;
  pricing_source: "catalog" | "project_costing";
  approved_at: string | null;
};

type VersionItemRow = {
  id: string;
  quotation_version_id: string;
  opening_id: string | null;
  opening_code: string;
  floor: string | null;
  room: string | null;
  width: number;
  height: number;
  solid_panel_height: number;
  quantity: number;
  product_system: string | null;
  glass_type: string | null;
  aluminum_color: string | null;
  unit_price: number;
  discount_percent: number;
  line_type: string;
  is_discountable: boolean;
  notes: string | null;
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
      { data: versions, error: versionsError },
      { data: versionItems, error: versionItemsError },
      { data: quotations, error: quotationsError },
      { data: projects, error: projectsError },
      { data: clients, error: clientsError },
    ] = await Promise.all([
      admin
        .from("quotation_versions")
        .select(
          "id, quotation_id, version_number, status, grand_total, pricing_source, approved_at",
        )
        .eq("status", "approved")
        .order("approved_at", { ascending: false }),
      admin
        .from("quotation_version_items")
        .select(
          "id, quotation_version_id, opening_id, opening_code, floor, room, width, height, solid_panel_height, quantity, product_system, glass_type, aluminum_color, unit_price, discount_percent, line_type, is_discountable, notes",
        ),
      admin
        .from("quotations")
        .select("id, quotation_number, project_id, client_id")
        .order("created_at", { ascending: false }),
      admin.from("projects").select("id, project_name"),
      admin.from("clients").select("id, client_name"),
    ]);

    const firstError =
      versionsError ??
      versionItemsError ??
      quotationsError ??
      projectsError ??
      clientsError;

    if (firstError) {
      throw firstError;
    }

    const projectsById = new Map(
      ((projects ?? []) as ProjectRow[]).map((project) => [project.id, project]),
    );
    const clientsById = new Map(
      ((clients ?? []) as ClientRow[]).map((client) => [client.id, client]),
    );
    const quotationsById = new Map(
      ((quotations ?? []) as QuotationSourceRow[]).map((quotation) => [
        quotation.id,
        quotation,
      ]),
    );
    const itemsByVersionId = new Map<string, VersionItemRow[]>();
    for (const item of (versionItems ?? []) as VersionItemRow[]) {
      const items = itemsByVersionId.get(item.quotation_version_id) ?? [];
      items.push(item);
      itemsByVersionId.set(item.quotation_version_id, items);
    }

    return NextResponse.json({
      quotations: ((versions ?? []) as ApprovedVersionRow[]).flatMap((version) => {
        const quotation = quotationsById.get(version.quotation_id);

        if (!quotation) {
          return [];
        }

        return [{
          id: quotation.id,
          versionId: version.id,
          versionNumber: version.version_number,
          quotationNumber: quotation.quotation_number,
          projectId: quotation.project_id,
          projectName: projectsById.get(quotation.project_id)?.project_name ?? "",
          clientId: quotation.client_id,
          clientName: clientsById.get(quotation.client_id)?.client_name ?? "",
          contractTotal: numberValue(version.grand_total),
          pricingSource: version.pricing_source,
          status: version.status,
          approvedAt: version.approved_at,
          items: itemsByVersionId.get(version.id) ?? [],
        }];
      }),
    });
  } catch (error) {
    logContractSourceError("select-contract-sources", error);
    return NextResponse.json(
      { error: friendlyDatabaseError(error, "Unable to load contract sources.") },
      { status: 500 },
    );
  }
}
