"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  defaultLocale,
  getDirection,
  isLocale,
  localeStorageKey,
  messagesByLocale,
  type Locale,
  type Messages,
} from "@/lib/i18n";

type Replacements = Record<string, string | number>;

type I18nContextValue = {
  locale: Locale;
  direction: "ltr" | "rtl";
  setLocale: (locale: Locale) => void;
  t: (key: string, replacements?: Replacements) => string;
  term: (value: string | null | undefined) => string;
  formatDate: (value: Date | string | number) => string;
  formatCurrency: (value: number) => string;
  messages: Messages;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readMessage(messages: Messages, key: string) {
  return key.split(".").reduce<unknown>((current, part) => {
    if (current && typeof current === "object" && part in current) {
      return (current as Record<string, unknown>)[part];
    }

    return undefined;
  }, messages);
}

function interpolate(message: string, replacements?: Replacements) {
  if (!replacements) {
    return message;
  }

  return Object.entries(replacements).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    message,
  );
}

function applyLocale(locale: Locale) {
  const direction = getDirection(locale);
  const messages = messagesByLocale[locale];
  const root = document.documentElement;

  root.lang = locale;
  root.dir = direction;
  root.dataset.locale = locale;
  root.classList.toggle("rtl", locale === "ar");
  root.classList.toggle("ltr", locale === "en");
  document.title = messages.app.title;

  return direction;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedLocale = localStorage.getItem(localeStorageKey);
      const nextLocale = isLocale(storedLocale) ? storedLocale : defaultLocale;

      setLocaleState(nextLocale);
      setDirection(applyLocale(nextLocale));
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function setLocale(nextLocale: Locale) {
    localStorage.setItem(localeStorageKey, nextLocale);
    setLocaleState(nextLocale);
    setDirection(applyLocale(nextLocale));
  }

  const messages = messagesByLocale[locale];

  const value = useMemo<I18nContextValue>(() => {
    function t(key: string, replacements?: Replacements) {
      const message = readMessage(messages, key);
      return typeof message === "string"
        ? interpolate(message, replacements)
        : key;
    }

    function term(rawValue: string | null | undefined) {
      if (!rawValue) {
        return t("common.notAdded");
      }

      return messages.terms[rawValue as keyof typeof messages.terms] ?? rawValue;
    }

    function formatDate(value: Date | string | number) {
      const date = value instanceof Date ? value : new Date(value);

      return new Intl.DateTimeFormat(locale === "ar" ? "ar-IQ" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(date);
    }

    function formatCurrency(value: number) {
      const formatted = new Intl.NumberFormat(locale === "ar" ? "ar-IQ" : "en-US", {
        maximumFractionDigits: 0,
      }).format(value);

      return locale === "ar" ? `${formatted} د.ع` : `IQD ${formatted}`;
    }

    return {
      locale,
      direction,
      setLocale,
      t,
      term,
      formatDate,
      formatCurrency,
      messages,
    };
  }, [locale, direction, messages]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }

  return context;
}
