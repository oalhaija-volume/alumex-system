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
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { navItems } from "@/data/ui";
import { canAccessRouteWithOverrides } from "@/lib/auth/permissions";
import {
  activeNavigationHrefs,
} from "@/lib/systemScope";
import type { DashboardPreviewRole } from "@/lib/dashboard/salesDashboard";

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
  iconOnly?: boolean;
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
        aria-current={isActive ? "page" : undefined}
        className={`flex min-h-[58px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-1.5 text-[11px] font-semibold transition ${
          isActive
            ? "bg-material-primary-container/70 text-material-primary"
            : "text-muted hover:bg-material-surface-container/70 hover:text-foreground"
        }`}
      >
        <span
          aria-hidden="true"
          className="flex h-6 w-full shrink-0 items-center justify-center"
        >
          <MobileNavIcon href={href} active={isActive} />
        </span>
        <span className="block w-full whitespace-normal text-center leading-[1.15]">
          {label}
        </span>
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

function MobileNavIcon({
  href,
  active,
}: {
  href: string;
  active: boolean;
}) {
  const iconClass = "h-[22px] w-[22px]";
  const strokeWidth = active ? 2.4 : 2;

  if (href === "/dashboard") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={strokeWidth}>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </svg>
    );
  }

  if (href === "/intake") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    );
  }

  if (href === "/projects") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round">
        <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" />
      </svg>
    );
  }

  if (href === "/crm") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 5h14v11H9l-4 3z" />
        <path d="M8 9h8M8 12h5" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 12h6M9 16h6" />
    </svg>
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

export function AppShell({
  children,
  previewRole = null,
}: {
  children: React.ReactNode;
  previewRole?: DashboardPreviewRole | null;
}) {
  const { direction, formatDate, t } = useI18n();
  const { isLoaded: isRoleLoaded, pageAccess, role } = useCurrentRole();
  const pathname = usePathname();
  const isRtl = direction === "rtl";
  const isWideWorkspace = pathname.startsWith("/site-measurements");
  const effectiveRole =
    role === "Admin" && previewRole ? previewRole : role;

  const availableNavItems =
    effectiveRole === "Admin" ? navItems : activeNavItems;
  const visibleNavItems = isRoleLoaded
    ? availableNavItems.filter((item) =>
        canAccessRouteWithOverrides(
          item.href,
          effectiveRole,
          effectiveRole === role ? pageAccess : [],
        ),
      )
    : activeNavItems;

  return (
    <div className="mobile-app-shell min-h-screen max-w-[100vw] overflow-x-hidden bg-background text-foreground">
      <PasswordChangePrompt />
      <aside
        className={`fixed inset-y-0 z-30 hidden w-72 flex-col overflow-hidden border-material-outline-variant bg-material-surface-container-low px-4 py-4 lg:flex ${
          isRtl ? "right-0 border-l" : "left-0 border-r"
        }`}
      >
        <div
          data-testid="sidebar-brand"
          className="flex shrink-0 justify-center rounded-lg bg-material-surface-container px-3 py-3 shadow-[var(--md-elevation-1)]"
        >
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

      <header
        data-testid="mobile-topbar"
        className="mobile-topbar sticky top-0 z-40 max-w-[100vw] border-b border-material-outline-variant bg-material-surface-container-low/90 px-4 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur-2xl lg:hidden"
      >
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/dashboard"
            aria-label="Alumex dashboard"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-material-surface-container"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logos/AlumexIcon.svg"
              alt=""
              className="h-8 w-8 object-contain"
            />
          </Link>
          <div className="flex min-w-0 items-center gap-1.5">
            <NotificationCenter compact />
            <LanguageSwitcher compact />
            <ThemeToggle compact />
            <ShellLogoutButton
              className="flex h-10 w-10 items-center justify-center rounded-full border border-material-outline-variant bg-material-surface-container-low text-muted-strong"
              label={t("auth.logout")}
              iconOnly
            />
          </div>
        </div>
      </header>

      <main
        className={`min-w-0 max-w-[100vw] overflow-x-hidden pb-24 lg:pb-0 ${
          isRtl ? "lg:mr-72" : "lg:ml-72"
        }`}
      >
        <div className="relative z-40 hidden max-w-full border-b border-material-outline-variant bg-material-surface-container-low px-8 py-4 shadow-[var(--md-elevation-1)] lg:block">
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
              <NotificationCenter />
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
          className={`mobile-content mx-auto w-full overflow-x-hidden px-4 py-5 sm:px-6 lg:px-8 lg:py-8 ${
            isWideWorkspace ? "max-w-none" : "max-w-7xl"
          }`}
        >
          {children}
        </div>
      </main>

      <nav
        data-testid="mobile-tabbar"
        className="mobile-tabbar fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-3 right-3 z-30 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-[22px] border border-material-outline-variant bg-material-surface-container-low/88 p-1.5 shadow-[var(--md-elevation-2)] backdrop-blur-2xl lg:hidden"
      >
        <div
          className="grid w-full items-stretch gap-1"
          style={{
            gridTemplateColumns: `repeat(${visibleNavItems.length}, minmax(0, 1fr))`,
          }}
        >
          {visibleNavItems.map((item) => (
            <div key={item.href} className="min-w-0">
              <NavLink compact {...item} />
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
}
