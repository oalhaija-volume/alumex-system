"use client";

import { useEffect, useState } from "react";
import type { AppRole } from "@/lib/auth/permissions";
import type { EmployeePageAccess } from "@/lib/auth/pageAccess";
import { normalizeAppRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/client";

export function useCurrentRole() {
  const [role, setRole] = useState<AppRole | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [pageAccess, setPageAccess] = useState<
    Array<Pick<EmployeePageAccess, "route_path" | "can_access">>
  >([]);
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
          setUserId(null);
          setPageAccess([]);
          return;
        }

        setUserId(user.id);

        if (user.email?.toLowerCase() === "admin@alumex.com") {
          setRole("Admin");
          setPageAccess([]);
          return;
        }

        const [{ data }, { data: accessData }] = await Promise.all([
          supabase
            .from("profiles")
            .select("role, is_active")
            .eq("id", user.id)
            .single(),
          supabase
            .from("employee_page_access")
            .select("route_path, can_access")
            .eq("user_id", user.id),
        ]);
        const profile = data as {
          role: AppRole | null;
          is_active: boolean | null;
        } | null;

        setRole(
          profile?.is_active === false
            ? null
            : normalizeAppRole(profile?.role),
        );
        setPageAccess(
          (accessData ?? []) as Array<
            Pick<EmployeePageAccess, "route_path" | "can_access">
          >,
        );
      } catch {
        setRole(null);
        setPageAccess([]);
      } finally {
        setIsLoaded(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return { role, userId, pageAccess, isLoaded, isAdmin: role === "Admin" };
}
