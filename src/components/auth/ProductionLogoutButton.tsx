"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearCurrentRoleCache } from "@/components/auth/useCurrentRole";
import { useI18n } from "@/components/i18n/I18nProvider";
import { clearClientDataCache } from "@/lib/clientRequestCache";
import { createClient } from "@/lib/supabase/client";

export function ProductionLogoutButton({
  className,
  label,
  iconOnly = false,
}: {
  className: string;
  label?: string;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useI18n();

  async function logout() {
    setIsLoading(true);

    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      clearCurrentRoleCache();
      clearClientDataCache();
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={isLoading}
      className={className}
      aria-label={label ?? t("auth.logout")}
    >
      {isLoading ? (
        <span aria-hidden={iconOnly}>
          {iconOnly ? "…" : t("auth.loggingOut")}
        </span>
      ) : iconOnly ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 5H5v14h5" />
          <path d="M14 8l4 4-4 4M8 12h10" />
        </svg>
      ) : (
        label ?? t("auth.logout")
      )}
    </button>
  );
}
