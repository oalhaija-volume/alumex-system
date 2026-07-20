import { NextResponse } from "next/server";
import { requireAdminUser, requireRole } from "@/lib/auth/adminServer";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  hasSupabaseServiceRoleKey,
  supabaseServiceRoleError,
} from "@/lib/supabase/config";
import { friendlyDatabaseError } from "@/lib/friendlyErrors";

type ProductPayload = {
  products?: unknown;
};

type ProductItemPayload = {
  id?: unknown;
  product_name?: unknown;
  category?: unknown;
  unit?: unknown;
  unit_price?: unknown;
  is_active?: unknown;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const productPriceRoles = [
  "Admin",
  "Sales Manager",
  "Sales Rep",
  "Branch Manager",
  "Procurement Engineer",
] as const;
const productSelect =
  "id, product_name, category, unit, unit_price, is_active, created_at, updated_at";

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  const text = textValue(value);
  return text || null;
}

function numberValue(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function logProductPriceError(operation: "select" | "upsert", error: unknown) {
  console.error("[api/settings/product-prices] Supabase error", {
    route: "/api/settings/product-prices",
    operation,
    table: "public.product_price_settings",
    client: "createAdminClient",
    executingRole: "service_role",
    error,
  });
}

function mapProductPayload(products: unknown, userId: string) {
  if (!Array.isArray(products)) {
    return [];
  }

  return products.reduce<
    Array<{
      id?: string;
      product_name: string;
      category: string | null;
      unit: string;
      unit_price: number;
      is_active: boolean;
      created_by: string;
    }>
  >((items, product) => {
    const row = product as ProductItemPayload;
    const id = typeof row.id === "string" && uuidPattern.test(row.id) ? row.id : undefined;
    const productName = textValue(row.product_name);
    const unit = textValue(row.unit) || "sqm";
    const unitPrice = numberValue(row.unit_price);

    if (productName && unit && unitPrice >= 0) {
      items.push({
        ...(id ? { id } : {}),
        product_name: productName,
        category: nullableText(row.category),
        unit,
        unit_price: unitPrice,
        is_active: row.is_active !== false,
        created_by: userId,
      });
    }

    return items;
  }, []);
}

export async function GET() {
  const authCheck = await requireRole(productPriceRoles);

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

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("product_price_settings")
    .select(productSelect)
    .order("product_name", { ascending: true });

  if (error) {
    logProductPriceError("select", error);
    return NextResponse.json(
      { error: friendlyDatabaseError(error, "Unable to load product prices.") },
      { status: 500 },
    );
  }

  return NextResponse.json({ products: data ?? [] });
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

  const body = (await request.json().catch(() => null)) as ProductPayload | null;
  const products = mapProductPayload(body?.products, adminCheck.user.id);

  if (!body || products.length === 0) {
    return NextResponse.json(
      { error: "At least one valid product price is required." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("product_price_settings")
    .upsert(products, { onConflict: "product_name" })
    .select(productSelect);

  if (error) {
    logProductPriceError("upsert", error);
    return NextResponse.json(
      { error: friendlyDatabaseError(error, "Unable to save product prices.") },
      { status: 500 },
    );
  }

  return NextResponse.json({ products: data ?? [] });
}
