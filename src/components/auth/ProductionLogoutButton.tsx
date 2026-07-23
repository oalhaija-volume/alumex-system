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
}: {
  className: string;
  label?: string;
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
    >
      {isLoading ? t("auth.loggingOut") : label ?? t("auth.logout")}
    </button>
  );
}
