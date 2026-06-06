import arMessages from "../../messages/ar.json";
import enMessages from "../../messages/en.json";

export type Locale = "en" | "ar";
export type Messages = typeof enMessages;

export const localeStorageKey = "alumex_locale";
export const defaultLocale: Locale = "en";
export const messagesByLocale: Record<Locale, Messages> = {
  en: enMessages,
  ar: arMessages,
};

export function isLocale(value: string | null): value is Locale {
  return value === "en" || value === "ar";
}

export function getDirection(locale: Locale) {
  return locale === "ar" ? "rtl" : "ltr";
}

export const localeInitScript = `
(function () {
  try {
    var storageKey = "${localeStorageKey}";
    var storedLocale = localStorage.getItem(storageKey);
    var locale = storedLocale === "ar" ? "ar" : "en";
    var root = document.documentElement;
    root.lang = locale;
    root.dir = locale === "ar" ? "rtl" : "ltr";
    root.dataset.locale = locale;
    root.classList.toggle("rtl", locale === "ar");
    root.classList.toggle("ltr", locale !== "ar");
  } catch (error) {
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
    document.documentElement.dataset.locale = "en";
    document.documentElement.classList.add("ltr");
  }
})();
`;
