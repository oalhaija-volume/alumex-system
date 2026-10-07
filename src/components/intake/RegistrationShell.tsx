"use client";

import { SalesReminders } from "@/components/workflow/SalesReminders";
import { OfflineStatus } from "@/components/offline/OfflineStatus";
import { pendingFieldChanges,isFieldOnline } from "@/lib/offline/client";
import { setFieldUser } from "@/lib/offline/store";
import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AppRole } from "@/lib/auth/permissions";
import { canAccessRoute } from "@/lib/auth/permissions";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";

const links = [
  ["/dashboard", "Dashboard", "لوحة المتابعة"],
  ["/intake", "New project", "مشروع جديد"],
  ["/projects", "Projects", "المشاريع"],
  ["/mini-crm", "Follow-ups", "المتابعات"],
  ["/catalog", "Price catalog", "دليل الأسعار"],
  ["/hr", "Employees", "الموظفون"],
  ["/operations", "Operations", "العمليات"],
];

function Brand({ small = false }: { small?: boolean }) {
 const { term } = useI18n();
  // The supplied brand asset is already an SVG.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logos/AlumexLogo.svg" alt={term("Alumex")} className={`${small ? "h-20" : "h-36"} w-auto object-contain`} />;
}

export function RegistrationShell({ children, role }: { children: React.ReactNode; role: AppRole }) {
  const { t, locale, term } = useI18n();
  const pathname = usePathname();
  const drawer = useRef<HTMLDialogElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuLabel = locale === "ar" ? "القائمة الرئيسية" : "Main menu";

  function closeMenu() {
    drawer.current?.close();
    setMenuOpen(false);
  }

  function navigation() {
    return <nav aria-label={menuLabel} className="space-y-1 px-4 py-5">
      {links.filter(([href]) => canAccessRoute(href, role)).map(([href, en, ar]) => {
        const active = pathname === href || (href === "/mini-crm" && /^\/projects\/[^/]+\/follow-ups$/.test(pathname)) || (href === "/projects" && /^\/(initial-measurements|quotation|contract)\//.test(pathname));
        return <Link key={href} href={href} onClick={event=>{closeMenu();if(!isFieldOnline()){event.preventDefault();window.location.assign("/offline?path="+encodeURIComponent(href));}}} aria-current={active ? "page" : undefined}
          className={`flex min-h-12 items-center rounded-md border-s-4 px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${active ? "border-blue-600 bg-blue-50 text-blue-700" : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}>
          {locale === "ar" ? ar : en}
        </Link>;
      })}
    </nav>;
  }

  function accountControls() {
    return <div className="mt-auto space-y-4 border-t border-slate-200 p-5">
      <LanguageSwitcher />
      <form action="/auth/logout" method="post" onSubmit={async event=>{
        event.preventDefault();const form=event.currentTarget;
        if(!isFieldOnline()){alert(term("Connect to the internet before signing out."));return;}
        if(await pendingFieldChanges()){alert(locale === "ar" ? "يرجى مزامنة التغييرات المحفوظة قبل تسجيل الخروج." : "Sync the changes saved on this device before signing out.");return;}
        setFieldUser(null);form.submit();
      }}>
        <button type="submit" className="min-h-11 w-full rounded-md px-3 text-start text-sm text-slate-600 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600">{t("mobileAccess.signOut")}</button>
      </form>
    </div>;
  }

  return (
    <div className="min-h-dvh bg-white text-slate-900 sm:bg-slate-50">
      <aside aria-label={menuLabel} className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col overflow-y-auto border-e border-slate-200 bg-white lg:flex print:hidden">
        <div className="flex justify-center border-b border-slate-100 px-6 py-8"><Brand /></div>
        {navigation()}
        {accountControls()}
      </aside>

      <header className="flex h-28 items-center justify-between border-b border-slate-200 bg-white px-5 lg:hidden print:hidden">
        <Brand small />
        <button type="button" aria-label={menuLabel} aria-haspopup="dialog" aria-controls="workspace-menu" aria-expanded={menuOpen}
          onClick={() => { drawer.current?.showModal(); setMenuOpen(true); }}
          className="flex min-h-12 items-center gap-3 rounded-md border border-slate-200 px-4 text-sm font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-blue-600">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          {locale === "ar" ? "القائمة" : term("Menu")}
        </button>
      </header>

      <dialog ref={drawer} id="workspace-menu" aria-label={menuLabel} onClose={() => setMenuOpen(false)}
        onClick={event => { if (event.target === event.currentTarget) closeMenu(); }}
        className="fixed inset-y-0 start-0 end-auto m-0 h-dvh max-h-none w-72 max-w-[85vw] border-0 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/40 print:hidden">
        <div className="flex min-h-full flex-col">
          <div className="flex justify-end px-4 pt-4"><button type="button" onClick={closeMenu} aria-label={locale === "ar" ? "إغلاق القائمة" : "Close menu"} className="flex h-11 w-11 items-center justify-center rounded-md text-2xl text-slate-600 hover:bg-slate-100">×</button></div>
          <div className="flex justify-center border-b border-slate-100 px-6 pb-6"><Brand /></div>
          {navigation()}
          {accountControls()}
        </div>
      </dialog>

      <main className="min-w-0 lg:ps-64 print:ps-0" onClickCapture={event=>{const link=(event.target as HTMLElement).closest('a[href]');const href=link?.getAttribute('href');if(!isFieldOnline()&&href?.startsWith('/')&&href!=='/offline'){event.preventDefault();event.stopPropagation();window.location.assign('/offline?path='+encodeURIComponent(href));}}}>{role && ["Admin","Indoor Sales","Outdoor Sales"].includes(role) && <><OfflineStatus/><SalesReminders/></>}{children}</main>
    </div>
  );
}
