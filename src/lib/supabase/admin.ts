import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig, getSupabaseServiceRoleKey } from "@/lib/supabase/config";

export function createAdminClient() {
  const { supabaseUrl } = getSupabaseConfig();

  return createClient(supabaseUrl, getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
