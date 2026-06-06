"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { createDevSessionCookie } from "@/lib/auth/devSession";

export function LoginForm() {
  const router = useRouter();
  const { t } = useI18n();

  function enterDemoWorkspace() {
    createDevSessionCookie();
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="mt-7 space-y-4">
      <button
        type="button"
        onClick={enterDemoWorkspace}
        className="flex h-12 w-full items-center justify-center rounded-md bg-primary text-sm font-bold text-white shadow-sm transition hover:bg-primary-hover"
      >
        {t("auth.enterDemoWorkspace")}
      </button>
    </div>
  );
}
