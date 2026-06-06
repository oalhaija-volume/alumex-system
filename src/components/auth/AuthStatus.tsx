"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { hasBrowserDevSession } from "@/lib/auth/devSession";
import type { AppRole } from "@/lib/auth/permissions";

type ProfileSummary = {
  email: string;
  fullName: string | null;
  role: AppRole | null;
};

export function AuthStatus() {
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const { t, term } = useI18n();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setProfile(
        hasBrowserDevSession()
          ? {
              email: "demo@alumex.local",
              fullName: null,
              role: "Admin",
            }
          : null,
      );
      setIsLoaded(true);
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
        {profile.fullName ?? (profile.email === "demo@alumex.local" ? t("auth.demoWorkspace") : profile.email)}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted">
        {profile.role ? term(profile.role) : t("auth.roleNotAssigned")}
      </p>
    </div>
  );
}
