"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCurrentRole } from "@/components/auth/useCurrentRole";
import { canAccessRoute } from "@/lib/auth/permissions";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";

export function RegistrationShell({ children }: { children: React.ReactNode }) {
  const { t, locale } = useI18n();
  const {role}=useCurrentRole();
  const pathname=usePathname();
  const links=[["/intake","New project","مشروع جديد"],["/projects","Projects","المشاريع"],["/mini-crm","Follow-ups","المتابعات"],["/catalog","Price catalog","دليل الأسعار"],["/hr","Employees","الموظفون"],["/operations","Operations","العمليات"]];
  return (
    <div className="min-h-dvh bg-white text-slate-900 sm:bg-slate-50">
      <header className="print:hidden border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <div className="w-32">{/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/AlumexLogo.svg" alt="Alumex" className="h-14 w-auto object-contain" /></div>
          <div className="flex items-center gap-5">
            <LanguageSwitcher />
            <form action="/auth/logout" method="post"><button type="submit" className="min-h-11 px-2 text-sm text-slate-600">{t("mobileAccess.signOut")}</button></form>
          </div>
        </div>
        <nav aria-label="Workspace" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-5 sm:px-8">{links.filter(([href])=>canAccessRoute(href,role)).map(([href,en,ar])=><Link key={href} href={href} aria-current={pathname===href?'page':undefined} className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium ${pathname===href?'border-blue-600 text-blue-700':'border-transparent text-slate-600 hover:text-blue-600'}`}>{locale==='ar'?ar:en}</Link>)}</nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
