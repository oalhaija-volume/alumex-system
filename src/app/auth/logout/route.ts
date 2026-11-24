import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.cookies.delete("alumex_dev_session");
  if (!hasSupabaseConfig()) {
    return response;
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  // A shared-device account switch ends this session without signing the
  // employee out of other devices. Local cookies must also expire if the
  // remote auth service cannot revoke the refresh token at this moment.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      supabase.auth.signOut({ scope: "local" }),
      new Promise<void>(resolve => { timer = setTimeout(resolve, 5000); }),
    ]);
  }
  catch { /* Expire this browser's credentials below. */ }
  finally { clearTimeout(timer); }
  for (const { name } of request.cookies.getAll()) {
    if (/^sb-.+-auth-token(?:\.\d+)?$/.test(name)) response.cookies.delete(name);
  }
  return response;
}
