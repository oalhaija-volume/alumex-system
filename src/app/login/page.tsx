"use client";
import { Suspense } from "react";
import { ProductionLoginForm } from "@/components/auth/ProductionLoginForm";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/components/i18n/I18nProvider";

export default function LoginPage() {
  const { t } = useI18n();
  return <main className="grid min-h-dvh place-items-center bg-slate-50 px-5 py-8">
    <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-7">
      <div className="flex items-center justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logos/AlumexLogo.svg" alt="Alumex" className="h-16 w-auto" />
        <LanguageSwitcher />
      </div>
      <h1 className="mt-7 text-2xl font-semibold text-slate-900">{t("auth.login")}</h1>
      <Suspense fallback={<p>{t("common.loading")}</p>}><ProductionLoginForm /></Suspense>
    </section>
  </main>;
}
