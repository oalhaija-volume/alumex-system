"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useCurrentRole } from "@/components/auth/useCurrentRole";
import { ClientForm, type ClientFormValues } from "@/components/clients/ClientForm";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useClients } from "@/components/clients/ClientsProvider";
import { PageHeader } from "@/components/PageHeader";
import { SectionCard } from "@/components/SectionCard";

const details: Array<[string, keyof ClientFormValues]> = [
  ["clients.fields.clientName", "clientName"],
  ["clients.fields.mobile", "mobile"],
  ["clients.fields.alternateMobile", "alternateMobile"],
  ["clients.fields.address", "address"],
  ["clients.fields.province", "province"],
  ["clients.fields.city", "city"],
  ["clients.fields.email", "email"],
  ["clients.fields.notes", "notes"],
];

export function ClientDetails() {
  const params = useParams<{ clientId: string }>();
  const router = useRouter();
  const { t, term } = useI18n();
  const { findClient, updateClient, deleteClient } = useClients();
  const { isAdmin } = useCurrentRole();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [error, setError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const client = findClient(params.clientId);

  if (!client) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("clients.eyebrow")}
          title={t("clients.clientNotFound")}
          description={t("clients.clientNotFoundDescription")}
        />
        <Link
          href="/clients"
          className="inline-flex h-11 items-center rounded-md bg-[var(--alumex-blue)] px-4 text-sm font-bold text-white"
        >
          {t("clients.backToClients")}
        </Link>
      </div>
    );
  }

  const activeClient = client;

  async function handleSubmit(values: ClientFormValues) {
    setError("");

    try {
      await updateClient(activeClient.id, values);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t("clients.saveError"),
      );
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setError("");

    try {
      await deleteClient(activeClient.id);
      router.push("/clients");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t("clients.deleteError"),
      );
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("clients.detailsEyebrow")}
        title={term(activeClient.clientName)}
        description={t("clients.detailsDescription")}
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/clients"
          className="flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700"
        >
          {t("clients.backToClients")}
        </Link>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => setIsDeleteOpen(true)}
            className="h-11 rounded-md border border-danger-text bg-transparent px-4 text-sm font-bold text-danger-text transition hover:bg-danger-text hover:text-white"
          >
            {t("clients.deleteClient")}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-md border border-border bg-danger-surface px-3 py-2 text-sm font-semibold text-danger-text">
          {error}
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
        <SectionCard title={t("clients.clientInformation")}>
          <dl className="grid gap-3">
            {details.map(([labelKey, key]) => (
              <div
                key={key}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {t(labelKey)}
                </dt>
                <dd className="mt-1 text-sm font-semibold leading-6 text-slate-950">
                  {activeClient[key] ? term(String(activeClient[key])) : t("common.notAdded")}
                </dd>
              </div>
            ))}
          </dl>
        </SectionCard>

        <SectionCard title={t("clients.editClient")}>
          <ClientForm
            client={activeClient}
            onSubmit={handleSubmit}
            onCancel={() => router.push("/clients")}
          />
        </SectionCard>
      </section>

      {isDeleteOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-client-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
        >
          <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-xl">
            <h2 id="delete-client-title" className="text-lg font-bold text-foreground">
              {t("clients.deleteClient")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-strong">
              {t("clients.deleteConfirm", {
                name: term(activeClient.clientName),
              })}
            </p>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setIsDeleteOpen(false)}
                className="h-11 rounded-md border border-border bg-surface px-4 text-sm font-bold text-muted-strong transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-muted"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDelete}
                className="h-11 rounded-md bg-danger-text px-4 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
              >
                {isDeleting ? t("common.loading") : t("clients.deleteClient")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
