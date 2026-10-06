"use client";

import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";

export function RegistrationShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="min-h-dvh bg-white text-slate-900 sm:bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <div className="w-32">{/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/AlumexLogo.svg" alt="Alumex" className="h-14 w-auto object-contain" /></div>
          <div className="flex items-center gap-5">
            <LanguageSwitcher />
            <form action="/auth/logout" method="post"><button type="submit" className="min-h-11 px-2 text-sm text-slate-600">{t("mobileAccess.signOut")}</button></form>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
