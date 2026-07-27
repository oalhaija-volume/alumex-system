import { NextResponse } from "next/server";
import { requireAdminUser, requireRole } from "@/lib/auth/adminServer";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";
import {
  defaultOpeningDropdownOptions,
  type OpeningDropdownOption,
  type OpeningOptionCategory,
} from "@/lib/openings/dropdownOptions";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";

const openingOptionRoles = [
  "Admin",
  "Sales Manager",
  "Indoor Sales",
  "Outdoor Sales",
  "Sales Rep",
  "Branch Manager",
  "Project Engineer",
  "Site Engineer",
] as const;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const categories: OpeningOptionCategory[] = [
  "room",
  "aluminum_section",
  "glass_type",
  "glass_color",
];
const optionSelect =
  "id, category, label, sort_order, is_active, created_at, updated_at";

type OptionPayload = {
  id?: unknown;
  category?: unknown;
  label?: unknown;
  sort_order?: unknown;
  is_active?: unknown;
};

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isOpeningOptionCategory(
  value: unknown,
): value is OpeningOptionCategory {
  return categories.includes(value as OpeningOptionCategory);
}

function mapOptionsPayload(options: unknown, userId: string) {
  if (!Array.isArray(options)) {
    return [];
  }

  return options.reduce<
    Array<{
      id?: string;
      category: OpeningOptionCategory;
      label: string;
      sort_order: number;
      is_active: boolean;
      created_by: string;
    }>
  >((rows, option, index) => {
    const payload = option as OptionPayload;
    const label = textValue(payload.label);

    if (!label || !isOpeningOptionCategory(payload.category)) {
      return rows;
    }

    const sortOrder = Number(payload.sort_order);
    const id =
      typeof payload.id === "string" && uuidPattern.test(payload.id)
        ? payload.id
        : undefined;

    rows.push({
      ...(id ? { id } : {}),
      category: payload.category,
      label,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : index + 1,
      is_active: payload.is_active !== false,
      created_by: userId,
    });

    return rows;
  }, []);
}

function fallbackOptions() {
  return NextResponse.json({ options: defaultOpeningDropdownOptions });
}

export async function GET() {
  const authCheck = await requireRole(openingOptionRoles);

  if (!authCheck.ok) {
    return NextResponse.json(
      { error: authCheck.error },
      { status: authCheck.status },
    );
  }

  if (!hasSupabaseServiceRoleKey()) {
    return fallbackOptions();
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("opening_dropdown_options")
    .select(optionSelect)
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    console.error("[api/settings/opening-dropdown-options] select failed", {
      route: "/api/settings/opening-dropdown-options",
      operation: "select",
      table: "public.opening_dropdown_options",
      client: "createAdminClient",
      executingRole: "service_role",
      error,
    });

    return fallbackOptions();
  }

  return NextResponse.json({
    options: ((data ?? []) as OpeningDropdownOption[]).length
      ? data
      : defaultOpeningDropdownOptions,
  });
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

  const body = (await request.json().catch(() => null)) as {
    options?: unknown;
  } | null;
  const options = mapOptionsPayload(body?.options, adminCheck.user.id);

  if (!body || options.length === 0) {
    return NextResponse.json(
      { error: "At least one valid dropdown option is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("opening_dropdown_options")
    .upsert(options, { onConflict: "category,label" })
    .select(optionSelect);

  if (error) {
    console.error("[api/settings/opening-dropdown-options] upsert failed", {
      route: "/api/settings/opening-dropdown-options",
      operation: "upsert",
      table: "public.opening_dropdown_options",
      client: "createAdminClient",
      executingRole: "service_role",
      error,
    });

    return NextResponse.json(
      {
        error: friendlyDatabaseError(
          error,
          "Unable to save opening dropdown options.",
        ),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ options: data ?? [] });
}
