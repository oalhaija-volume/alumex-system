"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { createClient } from "@/lib/supabase/client";
import { supabaseConfigError } from "@/lib/supabase/config";

function getLoginErrorMessage(error: unknown, failedToFetch: string, fallback: string) {
  if (error instanceof Error) {
    if (error.message.toLowerCase().includes("failed to fetch")) {
      return failedToFetch;
    }

    return error.message;
  }

  return fallback;
}

export function ProductionLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const redirectTo = searchParams.get("redirectTo") ?? "/dashboard";
  const hasMissingConfiguration =
    searchParams.get("configuration") === "missing";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    hasMissingConfiguration ? supabaseConfigError : "",
  );
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      const profileResponse = await fetch("/api/auth/bootstrap-profile", {
        method: "POST",
      });

      if (!profileResponse.ok) {
        const body = (await profileResponse.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? t("auth.loginError"));
        await supabase.auth.signOut();
        return;
      }

      router.replace(redirectTo);
      router.refresh();
    } catch (loginError) {
      setError(
        getLoginErrorMessage(
          loginError,
          t("auth.supabaseFetchError"),
          t("auth.loginError"),
        ),
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mt-7 space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-bold text-muted-strong">
            {t("auth.email")}
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={t("auth.emailPlaceholder")}
            className="mt-2 h-12 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-info-surface"
          />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-muted-strong">
            {t("auth.password")}
          </span>
          <input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t("auth.passwordPlaceholder")}
            className="mt-2 h-12 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-info-surface"
          />
        </label>
        {error ? (
          <p className="rounded-md border border-border bg-danger-surface px-3 py-2 text-sm font-semibold text-danger-text">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isLoading}
          className="flex h-12 w-full items-center justify-center rounded-md bg-primary text-sm font-bold text-white shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
        >
          {isLoading ? t("auth.signingIn") : t("auth.loginButton")}
        </button>
      </form>
    </div>
  );
}
