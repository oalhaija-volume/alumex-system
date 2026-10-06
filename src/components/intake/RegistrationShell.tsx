"use client";

import Link from "next/link";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";

export function RegistrationShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="min-h-dvh bg-white text-slate-900 sm:bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/projects" className="w-32" aria-label={t("nav.projects")}>{/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/AlumexLogo.svg" alt="Alumex" className="h-14 w-auto object-contain" /></Link>
          <div className="flex items-center gap-5">
            <Link href="/projects" className="hidden text-sm font-medium text-slate-600 hover:text-blue-600 sm:block">{t("nav.projects")}</Link>
            <LanguageSwitcher />
            <Link href="/projects" aria-label={t("registration.close")} className="flex h-11 w-11 items-center justify-center rounded-md text-2xl text-slate-500 hover:bg-slate-100">×</Link>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
