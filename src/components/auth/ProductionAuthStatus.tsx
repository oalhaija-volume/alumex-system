"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import type { AppRole } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/client";

type ProfileSummary = {
  email: string;
  fullName: string | null;
  role: AppRole | null;
};

export function ProductionAuthStatus() {
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const { t, term } = useI18n();

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setProfile(null);
          setIsLoaded(true);
          return;
        }

        const { data } = await supabase
          .from("profiles")
          .select("email, full_name, role")
          .eq("id", user.id)
          .single();
        const profileData = data as unknown as {
          email: string | null;
          full_name: string | null;
          role: AppRole | null;
        } | null;

        setProfile({
          email: profileData?.email ?? user.email ?? "",
          fullName: profileData?.full_name ?? null,
          role:
            user.email?.toLowerCase() === "admin@alumex.com"
              ? "Admin"
              : profileData?.role ?? null,
        });
      } catch {
        setProfile(null);
      } finally {
        setIsLoaded(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  if (!isLoaded) {
    return (
      <div className="rounded-lg border border-border bg-surface-muted p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">
          {t("auth.session")}
        </p>
        <p className="mt-2 text-sm font-bold text-foreground">
          {t("auth.loadingUser")}
        </p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="rounded-lg border border-border bg-surface-muted p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">
          {t("auth.session")}
        </p>
        <p className="mt-2 text-sm font-bold text-foreground">
          {t("auth.notSignedIn")}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-muted p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">
        {t("auth.signedIn")}
      </p>
      <p className="mt-2 truncate text-sm font-bold text-foreground">
        {profile.fullName ?? profile.email}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted">
        {profile.role ? term(profile.role) : t("auth.roleNotAssigned")}
      </p>
    </div>
  );
}
