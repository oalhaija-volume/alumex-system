import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/adminServer";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

const costingRoles = ["Admin", "Procurement Engineer"] as const;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const costingSelect =
  "id, project_id, aluminum_system_name, aluminum_system_cost, installation_cost, fabrication_cost, glass_cost, shipping_cost, total_profit, total_project_cost, supplier_quotation_path, supplier_quotation_name, notes, updated_at";
const allowedQuotationExtensions = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "jpg",
  "jpeg",
  "png",
  "webp",
]);

type CostingPayload = {
  projectId?: unknown;
  aluminumSystemName?: unknown;
  aluminumSystemCost?: unknown;
  installationCost?: unknown;
  fabricationCost?: unknown;
  glassCost?: unknown;
  shippingCost?: unknown;
  totalProfit?: unknown;
  totalProjectCost?: unknown;
  notes?: unknown;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function moneyValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(number, 0) : 0;
}

function costingValues(body: CostingPayload, userId: string) {
  return {
    aluminum_system_name: textValue(body.aluminumSystemName) || null,
    aluminum_system_cost: moneyValue(body.aluminumSystemCost),
    installation_cost: moneyValue(body.installationCost),
    fabrication_cost: moneyValue(body.fabricationCost),
    glass_cost: moneyValue(body.glassCost),
    shipping_cost: moneyValue(body.shippingCost),
    total_profit: moneyValue(body.totalProfit),
    total_project_cost: moneyValue(body.totalProjectCost),
    notes: textValue(body.notes) || null,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
}

async function requireCostingAccess() {
  const authCheck = await requireRole(costingRoles);

  if (!authCheck.ok) {
    return { response: NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    ) } as const;
  }

  if (!hasSupabaseServiceRoleKey()) {
    return { response: NextResponse.json(
      { error: supabaseServiceRoleError },
      { status: 500 },
    ) } as const;
  }

  return { authCheck } as const;
}

export async function GET() {
  const access = await requireCostingAccess();
  if ("response" in access) return access.response;

  const admin = createAdminClient();
  const [projectsResult, costingsResult] = await Promise.all([
    admin
      .from("projects")
      .select("id, project_number, project_name, project_type, workflow_status")
      .order("created_at", { ascending: false }),
    admin.from("project_costings").select(costingSelect),
  ]);
  const error = projectsResult.error ?? costingsResult.error;

  if (error) {
    return NextResponse.json(
      { error: friendlyDatabaseError(error, "Unable to load project costings.") },
      { status: 500 },
    );
  }

  const costings = await Promise.all(
    (costingsResult.data ?? []).map(async (costing) => {
      if (!costing.supplier_quotation_path) return costing;

      const { data } = await admin.storage
        .from("costing-quotations")
        .createSignedUrl(costing.supplier_quotation_path, 3600);

      return { ...costing, supplier_quotation_url: data?.signedUrl ?? null };
    }),
  );

  return NextResponse.json({ projects: projectsResult.data ?? [], costings });
}

export async function PUT(request: Request) {
  const access = await requireCostingAccess();
  if ("response" in access) return access.response;

  const body = (await request.json().catch(() => null)) as CostingPayload | null;
  const projectId = textValue(body?.projectId);

  if (!body || !uuidPattern.test(projectId)) {
    return NextResponse.json(
      { error: "A valid project is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("project_costings")
    .upsert(
      {
        project_id: projectId,
        ...costingValues(body, access.authCheck.user.id),
        created_by: access.authCheck.user.id,
      },
      { onConflict: "project_id" },
    )
    .select(costingSelect)
    .single();

  if (error) {
    return NextResponse.json(
      { error: friendlyDatabaseError(error, "Unable to save project costing.") },
      { status: 500 },
    );
  }

  return NextResponse.json({ costing: data });
}

export async function POST(request: Request) {
  const access = await requireCostingAccess();
  if ("response" in access) return access.response;

  const formData = await request.formData();
  const projectId = textValue(formData.get("projectId"));
  const file = formData.get("file");

  if (!uuidPattern.test(projectId) || !(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { error: "Select a project and quotation file." },
      { status: 400 },
    );
  }

  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Quotation files must be 20 MB or smaller." },
      { status: 400 },
    );
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedQuotationExtensions.has(extension)) {
    return NextResponse.json(
      { error: "Use a PDF, Office document, or image quotation file." },
      { status: 400 },
    );
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const storagePath = `${projectId}/${Date.now()}-${safeName}`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage
    .from("costing-quotations")
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: friendlyDatabaseError(uploadError, "Unable to upload quotation.") },
      { status: 500 },
    );
  }

  const { data, error } = await admin
    .from("project_costings")
    .upsert(
      {
        project_id: projectId,
        supplier_quotation_path: storagePath,
        supplier_quotation_name: file.name,
        created_by: access.authCheck.user.id,
        updated_by: access.authCheck.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    )
    .select(costingSelect)
    .single();

  if (error) {
    return NextResponse.json(
      { error: friendlyDatabaseError(error, "Unable to attach quotation.") },
      { status: 500 },
    );
  }

  return NextResponse.json({ costing: data });
}
