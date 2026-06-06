import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseServiceRoleKey } from "@/lib/supabase/config";

const seedAdminEmail = "admin@alumex.com";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json(
      { error: "Authentication is required." },
      { status: 401 },
    );
  }

  const email = user.email?.toLowerCase();

  if (!email) {
    return NextResponse.json(
      { error: "The signed-in user does not have an email address." },
      { status: 400 },
    );
  }

  if (email !== seedAdminEmail) {
    return NextResponse.json({ ok: true });
  }

  const profile = {
    id: user.id,
    email,
    full_name:
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : null,
    role: "Admin" as const,
    is_active: true,
  };

  if (hasSupabaseServiceRoleKey()) {
    const admin = createAdminClient();
    const { error: upsertError } = await admin
      .from("profiles")
      .upsert(profile, { onConflict: "id" });

    if (upsertError) {
      return NextResponse.json(
        { error: upsertError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({
    ok: true,
    warning: "Admin profile persistence requires SUPABASE_SERVICE_ROLE_KEY.",
  });
}
