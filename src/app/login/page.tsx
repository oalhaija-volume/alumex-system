"use client";

import { Suspense } from "react";
import { BrandMark } from "@/components/BrandMark";
import { ProductionLoginForm } from "@/components/auth/ProductionLoginForm";
import { useI18n } from "@/components/i18n/I18nProvider";

export default function LoginPage() {
  const { t } = useI18n();

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1fr_420px]">
        <section className="hidden lg:block">
          <div className="max-w-xl">
            <BrandMark />
            <p className="mt-10 text-xs font-bold uppercase tracking-[0.2em] text-accent">
              {t("auth.commercialOperations")}
            </p>
            <h1 className="mt-3 text-5xl font-bold tracking-tight text-foreground">
              {t("auth.loginHeadline")}
            </h1>
            <p className="mt-5 text-lg leading-8 text-muted">
              {t("auth.loginDescription")}
            </p>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm sm:p-7">
          <div className="lg:hidden">
            <BrandMark />
          </div>
          <div className="mt-8 lg:mt-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
              {t("auth.secureAccess")}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-foreground">
              {t("auth.login")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {t("auth.productionDescription")}
            </p>
          </div>

          <Suspense
            fallback={
              <div className="mt-7 h-40 rounded-lg border border-border bg-surface-muted" />
            }
          >
            <ProductionLoginForm />
          </Suspense>
        </section>
      </div>
    </main>
  );
}
