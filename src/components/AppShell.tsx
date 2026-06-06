"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthStatus } from "@/components/auth/AuthStatus";
import { DevelopmentModeBanner } from "@/components/auth/DevelopmentModeBanner";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { BrandMark } from "@/components/BrandMark";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { navItems } from "@/data/ui";
import { hasBrowserDevSession } from "@/lib/auth/devSession";

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
        className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-[11px] font-bold ${
          isActive
            ? "bg-info-surface text-primary"
            : "text-muted hover:bg-surface-muted hover:text-foreground"
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
      className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-bold transition ${
        isActive
          ? "bg-primary text-white shadow-sm"
          : "text-muted hover:bg-surface-muted hover:text-foreground"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${
          isActive ? "bg-white/15" : "bg-surface-muted"
        }`}
      />
      {label}
    </Link>
  );
}

function ShellAuthStatus({ isDemoSession }: { isDemoSession: boolean }) {
  return isDemoSession ? <AuthStatus /> : <ProductionAuthStatus />;
}

function ShellLogoutButton({
  isDemoSession,
  ...props
}: LogoutButtonProps & { isDemoSession: boolean }) {
  return isDemoSession ? (
    <LogoutButton {...props} />
  ) : (
    <ProductionLogoutButton {...props} />
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { direction, formatDate, t } = useI18n();
  const isRtl = direction === "rtl";
  const [isDemoSession, setIsDemoSession] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsDemoSession(hasBrowserDevSession());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className={isRtl ? "lg:mr-72" : "lg:ml-72"}>
        <DevelopmentModeBanner />
      </div>
      <aside
        className={`fixed inset-y-0 z-30 hidden w-72 border-border bg-surface px-5 py-5 lg:block ${
          isRtl ? "right-0 border-l" : "left-0 border-r"
        }`}
      >
        <BrandMark />
        <nav className="mt-8 space-y-1">
          {navItems.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </nav>
        <div className="absolute bottom-5 left-5 right-5 space-y-3">
          <ShellAuthStatus isDemoSession={isDemoSession} />
          <ShellLogoutButton
            isDemoSession={isDemoSession}
            className="h-10 w-full rounded-md bg-foreground px-4 text-sm font-bold text-background"
          />
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <BrandMark />
          <div className="flex min-w-0 items-center gap-2">
            <LanguageSwitcher compact />
            <ThemeToggle compact />
            <ShellLogoutButton
              isDemoSession={isDemoSession}
              className="rounded-md border border-border px-3 py-2 text-xs font-bold text-muted-strong"
            />
          </div>
        </div>
      </header>

      <main className={`pb-24 lg:pb-0 ${isRtl ? "lg:mr-72" : "lg:ml-72"}`}>
        <div className="hidden border-b border-border bg-surface px-8 py-4 lg:block">
          <div className={`flex items-center justify-between gap-4 ${isRtl ? "flex-row-reverse" : ""}`}>
            <div>
              <p className="text-sm font-bold text-foreground">
                {t("topbar.workspace")}
              </p>
              <p className="text-xs text-muted">
                {t("topbar.workspaceDescription")}
              </p>
            </div>
            <div className={`flex shrink-0 items-center gap-2 ${isRtl ? "flex-row-reverse" : ""}`}>
              <LanguageSwitcher />
              <ThemeToggle />
              <div className="h-10 rounded-md border border-border bg-surface-muted px-4 text-sm font-semibold leading-10 text-muted">
                {formatDate(new Date())}
              </div>
              <ShellLogoutButton
                isDemoSession={isDemoSession}
                className="h-10 rounded-md bg-foreground px-4 text-sm font-bold leading-10 text-background"
              />
            </div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-surface px-2 py-2 shadow-[0_-10px_25px_rgba(15,23,42,0.08)] lg:hidden">
        <div className="flex gap-1">
          {navItems.map((item) => (
            <NavLink key={item.href} compact {...item} />
          ))}
        </div>
      </nav>
    </div>
  );
}
