"use client";

import { useEffect, useState } from "react";
import type { AppRole } from "@/lib/auth/permissions";
import type { EmployeePageAccess } from "@/lib/auth/pageAccess";
import { normalizeAppRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/client";

type CurrentRoleState = {
  role: AppRole | null;
  userId: string | null;
  email: string;
  fullName: string | null;
  pageAccess: Array<Pick<EmployeePageAccess, "route_path" | "can_access">>;
};

let currentRoleSnapshot: CurrentRoleState | null = null;
let currentRoleRequest: Promise<CurrentRoleState> | null = null;

export function clearCurrentRoleCache() {
  currentRoleSnapshot = null;
  currentRoleRequest = null;
}

async function loadCurrentRole(): Promise<CurrentRoleState> {
  if (currentRoleSnapshot) {
    return currentRoleSnapshot;
  }

  if (currentRoleRequest) {
    return currentRoleRequest;
  }

  currentRoleRequest = (async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return {
        role: null,
        userId: null,
        email: "",
        fullName: null,
        pageAccess: [],
      };
    }

    if (user.email?.toLowerCase() === "admin@alumex.com") {
      return {
        role: "Admin",
        userId: user.id,
        email: user.email ?? "",
        fullName: null,
        pageAccess: [],
      };
    }

    const [{ data }, { data: accessData }] = await Promise.all([
      supabase
        .from("profiles")
        .select("email, full_name, role, is_active")
        .eq("id", user.id)
        .single(),
      supabase
        .from("employee_page_access")
        .select("route_path, can_access")
        .eq("user_id", user.id),
    ]);
    const profile = data as {
      email: string | null;
      full_name: string | null;
      role: AppRole | null;
      is_active: boolean | null;
    } | null;

    return {
      role:
        profile?.is_active === false
          ? null
          : normalizeAppRole(profile?.role),
      userId: user.id,
      email: profile?.email ?? user.email ?? "",
      fullName: profile?.full_name ?? null,
      pageAccess: (accessData ?? []) as Array<
        Pick<EmployeePageAccess, "route_path" | "can_access">
      >,
    };
  })();

  try {
    currentRoleSnapshot = await currentRoleRequest;
    return currentRoleSnapshot;
  } finally {
    currentRoleRequest = null;
  }
}

export function useCurrentRole() {
  const [role, setRole] = useState<AppRole | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState<string | null>(null);
  const [pageAccess, setPageAccess] = useState<
    Array<Pick<EmployeePageAccess, "route_path" | "can_access">>
  >([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const state = await loadCurrentRole();
        setRole(state.role);
        setUserId(state.userId);
        setEmail(state.email);
        setFullName(state.fullName);
        setPageAccess(state.pageAccess);
      } catch {
        setRole(null);
        setUserId(null);
        setEmail("");
        setFullName(null);
        setPageAccess([]);
      } finally {
        setIsLoaded(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return {
    role,
    userId,
    email,
    fullName,
    pageAccess,
    isLoaded,
    isAdmin: role === "Admin",
  };
}
