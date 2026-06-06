"use client";

import { useTheme } from "@/components/theme/ThemeProvider";
import { useI18n } from "@/components/i18n/I18nProvider";
import type { ThemePreference } from "@/lib/theme";

type ThemeOption = {
  value: ThemePreference;
  labelKey: string;
};

const themeOptions: ThemeOption[] = [
  { value: "light", labelKey: "theme.light" },
  { value: "system", labelKey: "theme.system" },
  { value: "dark", labelKey: "theme.dark" },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();

  return (
    <label className="inline-flex items-center">
      <span className="sr-only">
        {t("theme.current", {
          theme: t(`theme.${theme}`),
          resolvedTheme: t(`theme.${resolvedTheme}`),
        })}
      </span>
      <select
        value={theme}
        onChange={(event) => setTheme(event.target.value as ThemePreference)}
        aria-label={t("theme.current", {
          theme: t(`theme.${theme}`),
          resolvedTheme: t(`theme.${resolvedTheme}`),
        })}
        className={`rounded-md border border-border bg-surface font-bold text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-info-surface ${
          compact ? "h-9 max-w-28 px-2 text-xs" : "h-10 max-w-32 px-3 text-sm"
        }`}
      >
        {themeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.labelKey)}
          </option>
        ))}
      </select>
    </label>
  );
}
