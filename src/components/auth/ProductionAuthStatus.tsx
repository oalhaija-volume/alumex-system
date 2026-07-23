"use client";

import { useCurrentRole } from "@/components/auth/useCurrentRole";
import { useI18n } from "@/components/i18n/I18nProvider";

export function ProductionAuthStatus() {
  const { t, term } = useI18n();
  const { email, fullName, isLoaded, role, userId } = useCurrentRole();

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

  if (!userId) {
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
        {fullName ?? email}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted">
        {role ? term(role) : t("auth.roleNotAssigned")}
      </p>
    </div>
  );
}
