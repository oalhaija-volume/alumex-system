"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/I18nProvider";

export default function MobileRequiredPage() {
  const { t } = useI18n();
  return (
    <main className="grid min-h-screen place-items-center bg-background p-5">
      <section className="w-full max-w-md space-y-5 rounded-lg border border-border bg-surface p-6 text-center">
        <h1 className="text-2xl font-bold text-foreground">{t("mobileAccess.title")}</h1>
        <p className="text-sm leading-6 text-muted">{t("mobileAccess.description")}</p>
        <Link href="/intake" className="flex min-h-11 items-center justify-center rounded-md border border-border px-4 font-bold">{t("mobileAccess.retry")}</Link>
        <form action="/auth/logout" method="post">
          <button type="submit" className="min-h-11 w-full rounded-md bg-primary px-4 font-bold text-white">{t("mobileAccess.signOut")}</button>
        </form>
      </section>
    </main>
  );
}
