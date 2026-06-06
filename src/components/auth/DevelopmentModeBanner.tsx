"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { hasBrowserDevSession, isDev } from "@/lib/auth/devSession";

export function DevelopmentModeBanner() {
  const [isDevelopmentMode, setIsDevelopmentMode] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsDevelopmentMode(isDev && hasBrowserDevSession());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  if (!isDevelopmentMode) {
    return null;
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-bold text-amber-900">
      {t("auth.developmentBanner")}
    </div>
  );
}
