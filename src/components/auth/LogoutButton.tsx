"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { clearDevSessionCookie } from "@/lib/auth/devSession";

export function LogoutButton({
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
    clearDevSessionCookie();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button type="button" onClick={logout} disabled={isLoading} className={className}>
      {isLoading ? t("auth.loggingOut") : label ?? t("auth.logout")}
    </button>
  );
}
