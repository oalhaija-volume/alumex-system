"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { createClient } from "@/lib/supabase/client";

const minPasswordLength = 8;

function passwordChangeRequired(value: unknown) {
  return value === true || value === "true";
}

export function PasswordChangePrompt() {
  const { t } = useI18n();
  const [isRequired, setIsRequired] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        setIsRequired(
          passwordChangeRequired(user?.user_metadata?.requires_password_change),
        );
      } finally {
        setIsLoaded(true);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (newPassword.length < minPasswordLength) {
      setError(t("auth.passwordTooShort"));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t("auth.passwordsDoNotMatch"));
      return;
    }

    setIsSaving(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.email) {
        setError(t("auth.loginError"));
        return;
      }

      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: oldPassword,
      });

      if (verifyError) {
        setError(t("auth.oldPasswordIncorrect"));
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
        data: {
          ...user.user_metadata,
          requires_password_change: false,
        },
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setIsRequired(false);
    } finally {
      setIsSaving(false);
    }
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  if (!isLoaded || !isRequired) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-change-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 px-4 py-6"
    >
      <div className="w-full max-w-md rounded-lg border border-material-outline-variant bg-material-surface p-5 shadow-[var(--md-elevation-3)]">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
          {t("auth.passwordChangeEyebrow")}
        </p>
        <h2
          id="password-change-title"
          className="mt-2 text-2xl font-bold text-foreground"
        >
          {t("auth.passwordChangeTitle")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-strong">
          {t("auth.passwordChangeDescription")}
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-bold text-muted-strong">
              {t("auth.oldTemporaryPassword")}
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
              className="mt-2 h-12 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-info-surface"
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-muted-strong">
              {t("auth.newPassword")}
            </span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="mt-2 h-12 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-info-surface"
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-muted-strong">
              {t("auth.confirmNewPassword")}
            </span>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-2 h-12 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-info-surface"
            />
          </label>

          {error ? (
            <p className="rounded-md border border-border bg-danger-surface px-3 py-2 text-sm font-semibold text-danger-text">
              {error}
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <button
              type="button"
              disabled={isSaving}
              onClick={logout}
              className="h-11 rounded-md border border-material-outline-variant px-4 text-sm font-bold text-muted-strong transition hover:bg-material-surface-container disabled:cursor-not-allowed disabled:text-muted"
            >
              {t("auth.logout")}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="h-11 rounded-md bg-material-primary px-4 text-sm font-bold text-material-on-primary shadow-[var(--md-elevation-1)] transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
            >
              {isSaving ? t("common.loading") : t("auth.updatePassword")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
