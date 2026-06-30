"use client";

import { useTheme } from "@/components/theme/ThemeProvider";
import { useI18n } from "@/components/i18n/I18nProvider";
import type { ThemePreference } from "@/lib/theme";

type ThemeOption = {
  value: ThemePreference;
  labelKey: string;
};

const toggleThemeOptions: ThemeOption[] = [
  { value: "light", labelKey: "theme.light" },
  { value: "dark", labelKey: "theme.dark" },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();
  const displayTheme = theme === "system" ? resolvedTheme : theme;
  const nextTheme: ThemePreference = displayTheme === "dark" ? "light" : "dark";
  const currentOption = toggleThemeOptions.find(
    (option) => option.value === displayTheme,
  );
  const nextOption = toggleThemeOptions.find(
    (option) => option.value === nextTheme,
  );
  const ariaLabel = t("theme.current", {
    theme: t(`theme.${theme}`),
    resolvedTheme: t(`theme.${resolvedTheme}`),
  });

  return (
    <div className="inline-flex items-center">
      <span className="sr-only">{ariaLabel}</span>
      <button
        type="button"
        onClick={() => setTheme(nextTheme)}
        aria-label={`${ariaLabel}. ${t(nextOption?.labelKey ?? "theme.dark")}`}
        className={`rounded-md border border-border bg-surface font-bold text-foreground shadow-sm outline-none transition hover:border-primary hover:bg-material-surface-container focus:border-primary focus:ring-4 focus:ring-info-surface ${
          compact ? "h-9 min-w-20 px-3 text-xs" : "h-10 min-w-24 px-4 text-sm"
        }`}
      >
        {t(currentOption?.labelKey ?? "theme.light")}
      </button>
    </div>
  );
}
