"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { PasswordChangePrompt } from "@/components/auth/PasswordChangePrompt";
import { useCurrentRole } from "@/components/auth/useCurrentRole";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { navItems } from "@/data/ui";
import { canAccessRouteWithOverrides } from "@/lib/auth/permissions";
import {
  activeNavigationHrefs,
} from "@/lib/systemScope";

const ProductionAuthStatus = dynamic(
  () =>
    import("@/components/auth/ProductionAuthStatus").then(
      (module) => module.ProductionAuthStatus,
    ),
  { ssr: false },
);

const ProductionLogoutButton = dynamic(
  () =>
    import("@/components/auth/ProductionLogoutButton").then(
      (module) => module.ProductionLogoutButton,
    ),
  { ssr: false },
);

const activeNavItems = activeNavigationHrefs.flatMap((href) => {
  const item = navItems.find((navItem) => navItem.href === href);
  return item ? [item] : [];
});

type LogoutButtonProps = {
  className: string;
  label?: string;
};

function NavLink({
  href,
  labelKey,
  compact = false,
}: {
  href: string;
  labelKey: string;
  icon: string;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const label = t(labelKey);
  const isActive =
    pathname === href ||
    pathname.startsWith(`${href}/`) ||
    (href === "/dashboard" && pathname === "/");

  if (compact) {
    return (
      <Link
        href={href}
        className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-bold transition ${
          isActive
            ? "bg-material-primary-container text-material-on-primary-container"
            : "text-muted hover:bg-material-surface-container hover:text-foreground"
        }`}
      >
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-current"
        />
        <span className="max-w-full truncate">{label}</span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition ${
        isActive
          ? "bg-material-primary-container text-material-on-primary-container shadow-[var(--md-elevation-1)]"
          : "text-muted hover:bg-material-surface-container hover:text-foreground"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${
          isActive ? "bg-material-primary" : "bg-material-outline-variant"
        }`}
      />
      {label}
    </Link>
  );
}

function ShellAuthStatus() {
  return <ProductionAuthStatus />;
}

function ShellLogoutButton({
  ...props
}: LogoutButtonProps) {
  return <ProductionLogoutButton {...props} />;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { direction, formatDate, t } = useI18n();
  const { isLoaded: isRoleLoaded, pageAccess, role } = useCurrentRole();
  const pathname = usePathname();
  const isRtl = direction === "rtl";
  const isWideWorkspace = pathname.startsWith("/site-measurements");

  const visibleNavItems = isRoleLoaded
    ? activeNavItems.filter((item) => {
        if (role === "Admin" && item.href === "/hr") {
          return false;
        }

        return canAccessRouteWithOverrides(item.href, role, pageAccess);
      })
    : activeNavItems;

  return (
    <div className="min-h-screen max-w-[100vw] overflow-x-hidden bg-background text-foreground">
      <PasswordChangePrompt />
      <aside
        className={`fixed inset-y-0 z-30 hidden w-72 flex-col overflow-hidden border-material-outline-variant bg-material-surface-container-low px-4 py-4 lg:flex ${
          isRtl ? "right-0 border-l" : "left-0 border-r"
        }`}
      >
        <div className="shrink-0 rounded-lg bg-material-surface-container px-3 py-3 shadow-[var(--md-elevation-1)]">
          <BrandMark />
        </div>
        <nav className="mt-5 min-h-0 flex-1 space-y-1 overflow-y-auto pb-2">
          {visibleNavItems.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>
        <div className="shrink-0 space-y-3 pt-3">
          <ShellAuthStatus />
          <ShellLogoutButton
            className="h-10 w-full rounded-md bg-material-primary px-4 text-sm font-bold text-material-on-primary shadow-[var(--md-elevation-1)]"
          />
        </div>
      </aside>

      <header className="sticky top-0 z-20 max-w-[100vw] overflow-x-hidden border-b border-material-outline-variant bg-material-surface-container-low/95 px-4 py-3 shadow-[var(--md-elevation-1)] backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/dashboard"
            aria-label="Alumex dashboard"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-material-surface-container"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logos/AlumexIcon.svg"
              alt=""
              className="h-8 w-8 object-contain"
            />
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            <LanguageSwitcher compact />
            <ThemeToggle compact />
            <ShellLogoutButton
              className="rounded-md border border-material-outline-variant px-3 py-2 text-xs font-bold text-muted-strong"
            />
          </div>
        </div>
      </header>

      <main
        className={`min-w-0 max-w-[100vw] overflow-x-hidden pb-24 lg:pb-0 ${
          isRtl ? "lg:mr-72" : "lg:ml-72"
        }`}
      >
        <div className="hidden max-w-full overflow-x-hidden border-b border-material-outline-variant bg-material-surface-container-low px-8 py-4 shadow-[var(--md-elevation-1)] lg:block">
          <div className={`flex min-w-0 items-center justify-between gap-4 ${isRtl ? "flex-row-reverse" : ""}`}>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">
                {t("topbar.workspace")}
              </p>
              <p className="text-xs text-muted">
                {t("topbar.workspaceDescription")}
              </p>
            </div>
            <div className={`flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2 ${isRtl ? "flex-row-reverse" : ""}`}>
              <LanguageSwitcher />
              <ThemeToggle />
              <div className="h-10 rounded-md border border-material-outline-variant bg-material-surface-container px-4 text-sm font-semibold leading-10 text-muted">
                {formatDate(new Date())}
              </div>
              <ShellLogoutButton
                className="h-10 rounded-md bg-material-primary px-4 text-sm font-bold leading-10 text-material-on-primary shadow-[var(--md-elevation-1)]"
              />
            </div>
          </div>
        </div>
        <div
          className={`mx-auto w-full overflow-x-hidden px-4 py-5 sm:px-6 lg:px-8 lg:py-8 ${
            isWideWorkspace ? "max-w-none" : "max-w-7xl"
          }`}
        >
          {children}
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 max-w-[100vw] overflow-x-hidden border-t border-material-outline-variant bg-material-surface-container-low px-2 py-2 shadow-[var(--md-elevation-2)] lg:hidden">
        <div className="flex gap-1">
          {visibleNavItems.map((item) => (
            <NavLink key={item.href} compact {...item} />
          ))}
        </div>
      </nav>
    </div>
  );
}
