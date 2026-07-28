"use client";

import { useI18n } from "@/components/i18n/I18nProvider";
import type { Locale } from "@/lib/i18n";

const languages: Array<{ value: Locale; labelKey: string }> = [
  { value: "en", labelKey: "language.english" },
  { value: "ar", labelKey: "language.arabic" },
];

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  const currentLanguage = languages.find((language) => language.value === locale);
  const nextLocale: Locale = locale === "en" ? "ar" : "en";
  const nextLanguage = languages.find((language) => language.value === nextLocale);

  return (
    <div className="inline-flex items-center">
      <span className="sr-only">{t("language.label")}</span>
      <button
        type="button"
        onClick={() => setLocale(nextLocale)}
        aria-label={`${t("language.label")}: ${t(
          currentLanguage?.labelKey ?? "language.english",
        )}. ${t(nextLanguage?.labelKey ?? "language.arabic")}`}
        className={`border border-border bg-surface font-bold text-foreground shadow-sm outline-none transition hover:border-primary hover:bg-material-surface-container focus:border-primary focus:ring-4 focus:ring-info-surface ${
          compact
            ? "h-10 min-w-[68px] rounded-full px-3 text-xs"
            : "h-10 min-w-28 rounded-md px-4 text-sm"
        }`}
      >
        {t(currentLanguage?.labelKey ?? "language.english")}
      </button>
    </div>
  );
}
