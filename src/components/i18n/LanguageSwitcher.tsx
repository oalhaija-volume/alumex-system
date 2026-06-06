"use client";

import { useI18n } from "@/components/i18n/I18nProvider";
import type { Locale } from "@/lib/i18n";

const languages: Array<{ value: Locale; labelKey: string }> = [
  { value: "en", labelKey: "language.english" },
  { value: "ar", labelKey: "language.arabic" },
];

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className="inline-flex items-center">
      <span className="sr-only">{t("language.label")}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        aria-label={t("language.label")}
        className={`rounded-md border border-border bg-surface font-bold text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-info-surface ${
          compact ? "h-9 max-w-28 px-2 text-xs" : "h-10 max-w-36 px-3 text-sm"
        }`}
      >
        {languages.map((language) => (
          <option key={language.value} value={language.value}>
            {t(language.labelKey)}
          </option>
        ))}
      </select>
    </label>
  );
}
