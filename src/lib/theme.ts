export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const themeStorageKey = "alumex_theme";
export const defaultTheme: ThemePreference = "light";

export const themeInitScript = `
(function () {
  try {
    var storageKey = "${themeStorageKey}";
    var storedTheme = localStorage.getItem(storageKey);
    var theme = storedTheme === "dark" || storedTheme === "system" ? storedTheme : "light";
    var resolvedTheme = theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : theme === "dark" ? "dark" : "light";
    var root = document.documentElement;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.classList.toggle("light", resolvedTheme === "light");
    root.dataset.theme = theme;
    root.dataset.resolvedTheme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
  } catch (error) {
    document.documentElement.classList.add("light");
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.resolvedTheme = "light";
  }
})();
`;
