export type SupabaseConfig = {
  supabaseUrl: string;
  supabaseKey: string;
};

export const supabaseConfigError =
  "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.";
export const supabaseServiceRoleError =
  "Missing SUPABASE_SERVICE_ROLE_KEY. Add it on the server to enable admin user management.";

function readEnvValue(value: string | undefined) {
  const trimmedValue = value?.trim();

  return trimmedValue || undefined;
}

function getSupabaseKey() {
  return (
    readEnvValue(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ??
    readEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

export function getSupabaseConfig(): SupabaseConfig {
  const supabaseUrl = readEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseKey = getSupabaseKey();

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(supabaseConfigError);
  }

  return { supabaseUrl, supabaseKey };
}

export function hasSupabaseConfig() {
  return Boolean(
    readEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL) && getSupabaseKey(),
  );
}

export function hasSupabaseServiceRoleKey() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseServiceRoleKey() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(supabaseServiceRoleError);
  }

  return serviceRoleKey;
}
