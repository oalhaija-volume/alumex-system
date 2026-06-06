"use client";

import { useEffect, useState } from "react";
import type { AppRole } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/client";

export function useCurrentRole() {
  const [role, setRole] = useState<AppRole | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setRole(null);
          return;
        }

        if (user.email?.toLowerCase() === "admin@alumex.com") {
          setRole("Admin");
          return;
        }

        const { data } = await supabase
          .from("profiles")
          .select("role, is_active")
          .eq("id", user.id)
          .single();
        const profile = data as {
          role: AppRole | null;
          is_active: boolean | null;
        } | null;

        setRole(profile?.is_active === false ? null : profile?.role ?? null);
      } catch {
        setRole(null);
      } finally {
        setIsLoaded(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return { role, isLoaded, isAdmin: role === "Admin" };
}
