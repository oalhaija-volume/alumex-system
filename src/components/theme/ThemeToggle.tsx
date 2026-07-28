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
        className={`border border-border bg-surface font-bold text-foreground shadow-sm outline-none transition hover:border-primary hover:bg-material-surface-container focus:border-primary focus:ring-4 focus:ring-info-surface ${
          compact
            ? "flex h-10 w-10 items-center justify-center rounded-full"
            : "h-10 min-w-24 rounded-md px-4 text-sm"
        }`}
      >
        {compact ? (
          displayTheme === "dark" ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5Z" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
            </svg>
          )
        ) : (
          t(currentOption?.labelKey ?? "theme.light")
        )}
      </button>
    </div>
  );
}
