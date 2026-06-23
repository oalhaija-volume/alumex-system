"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import {
  defaultDiscountPolicies,
  loadDiscountPolicies,
  type DiscountPolicy,
} from "@/lib/pricing/discountPolicy";

async function saveDiscountPolicies(policies: DiscountPolicy[]) {
  const response = await fetch("/api/settings/discount-policies", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ policies }),
  });
  const body = (await response.json().catch(() => null)) as {
    policies?: DiscountPolicy[];
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(body?.error ?? "Unable to save discount policies.");
  }

  return body?.policies ?? [];
}

export function DiscountPolicySettings() {
  const { t, term } = useI18n();
  const [policies, setPolicies] = useState<DiscountPolicy[]>(
    defaultDiscountPolicies,
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadPolicies = useCallback(async () => {
    setError("");
    setIsLoading(true);

    try {
      setPolicies(await loadDiscountPolicies());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t("settings.loadDiscountPoliciesError"),
      );
      setPolicies(defaultDiscountPolicies);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPolicies();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadPolicies]);

  function updatePolicy(role: DiscountPolicy["role"], value: number) {
    setPolicies((currentPolicies) =>
      currentPolicies.map((policy) =>
        policy.role === role
          ? {
              ...policy,
              max_discount_percent: Math.min(Math.max(value || 0, 0), 100),
            }
          : policy,
      ),
    );
  }

  async function handleSave() {
    setError("");
    setNotice("");
    setIsSaving(true);

    try {
      setPolicies(await saveDiscountPolicies(policies));
      setNotice(t("settings.discountPoliciesSaved"));
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t("settings.saveDiscountPoliciesError"),
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-strong">
        {t("settings.discountPolicyDescription")}
      </p>

      {error ? (
        <p className="rounded-md border border-border bg-danger-surface px-3 py-2 text-sm font-semibold text-danger-text">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-md border border-border bg-success-surface px-3 py-2 text-sm font-semibold text-success-text">
          {notice}
        </p>
      ) : null}

      {isLoading ? (
        <p className="rounded-lg border border-dashed border-border bg-surface-muted p-5 text-sm font-semibold text-muted">
          {t("common.loading")}
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {policies.map((policy) => (
            <label
              key={policy.role}
              className="rounded-lg border border-border bg-surface-muted p-4"
            >
              <span className="text-xs font-bold uppercase tracking-wide text-muted">
                {term(policy.role)}
              </span>
              <input
                type="number"
                min="0"
                max="100"
                value={policy.max_discount_percent}
                onChange={(event) =>
                  updatePolicy(policy.role, Number(event.target.value))
                }
                className="mt-3 h-11 w-full rounded-md border border-border bg-surface px-3 text-sm font-bold text-foreground"
              />
            </label>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={isSaving || isLoading}
        onClick={handleSave}
        className="h-10 rounded-md bg-primary px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
      >
        {isSaving ? t("common.loading") : t("settings.saveDiscountPolicies")}
      </button>
    </div>
  );
}
