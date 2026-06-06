"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/I18nProvider";

export default function UnauthorizedPage() {
  const { t } = useI18n();

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <section className="w-full max-w-lg rounded-lg border border-border bg-surface p-8 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
          {t("errors.accessDenied")}
        </p>
        <h1 className="mt-3 text-2xl font-bold text-foreground">
          {t("errors.accessDeniedTitle")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          {t("errors.accessDeniedDescription")}
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-bold text-white"
        >
          {t("errors.backToDashboard")}
        </Link>
      </section>
    </main>
  );
}
