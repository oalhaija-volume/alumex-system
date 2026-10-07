"use client";
import { Suspense } from "react";
import Link from "next/link";
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
      <div className="mt-7 border-t border-slate-200 pt-6">
        <Link href="/skylight" className="flex min-h-12 w-full items-center justify-center rounded-md border border-blue-600 bg-blue-50 px-4 py-3 text-center text-sm font-semibold text-blue-700 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          {t("auth.skylightCalculator")}
        </Link>
        <p className="mt-3 text-center text-sm text-slate-500">{t("auth.publicCalculatorDescription")}</p>
      </div>
    </section>
  </main>;
}
