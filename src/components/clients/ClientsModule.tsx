"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCurrentRole } from "@/components/auth/useCurrentRole";
import { ClientForm, type ClientFormValues } from "@/components/clients/ClientForm";
import { useClients } from "@/components/clients/ClientsProvider";
import { useI18n } from "@/components/i18n/I18nProvider";
import { PageHeader } from "@/components/PageHeader";
import { SectionCard } from "@/components/SectionCard";
import type { Client } from "@/data/ui";

function matchesSearch(client: Client, search: string) {
  const term = search.trim().toLowerCase();

  if (!term) {
    return true;
  }

  return [
    client.clientName,
    client.mobile,
    client.alternateMobile,
    client.address,
    client.province,
    client.city,
    client.email,
    client.notes,
  ]
    .join(" ")
    .toLowerCase()
    .includes(term);
}

function ClientCard({
  client,
  isAdmin,
  onEdit,
  onDelete,
}: {
  client: Client;
  isAdmin: boolean;
  onEdit: (client: Client) => void;
  onDelete: (client: Client) => void;
}) {
  const { t, term } = useI18n();

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-slate-950">
            {term(client.clientName)}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {term(client.city)}, {term(client.province)}
          </p>
        </div>
        <Link
          href={`/clients/${client.id}`}
          className="shrink-0 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-[var(--alumex-blue)]"
        >
          {t("common.details")}
        </Link>
      </div>
      <div className="mt-4 grid gap-2 text-sm text-slate-600">
        <p>
          <span className="font-bold text-slate-800">
            {t("clients.fields.mobile")}:
          </span>{" "}
          {client.mobile}
        </p>
        <p>
          <span className="font-bold text-slate-800">
            {t("clients.fields.email")}:
          </span>{" "}
          {client.email || t("common.notAdded")}
        </p>
        <p>
          <span className="font-bold text-slate-800">
            {t("clients.fields.address")}:
          </span>{" "}
          {term(client.address)}
        </p>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => onEdit(client)}
          className="h-10 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700"
        >
          {t("common.edit")}
        </button>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => onDelete(client)}
            className="h-10 flex-1 rounded-md border border-danger-text bg-transparent px-3 text-sm font-bold text-danger-text transition hover:bg-danger-text hover:text-white"
          >
            {t("common.delete")}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function ClientsModule() {
  const { clients, createClient, updateClient, deleteClient } = useClients();
  const { isAdmin } = useCurrentRole();
  const { t, term } = useI18n();
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredClients = useMemo(
    () => clients.filter((client) => matchesSearch(client, search)),
    [clients, search],
  );

  function openCreateForm() {
    setEditingClient(undefined);
    setIsFormOpen(true);
  }

  function openEditForm(client: Client) {
    setEditingClient(client);
    setIsFormOpen(true);
  }

  function closeForm() {
    setEditingClient(undefined);
    setIsFormOpen(false);
  }

  async function handleSubmit(values: ClientFormValues) {
    setError("");

    try {
      if (editingClient) {
        await updateClient(editingClient.id, values);
      } else {
        await createClient(values);
      }

      closeForm();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t("clients.saveError"),
      );
    }
  }

  function handleDelete(client: Client) {
    setDeleteTarget(client);
    setError("");
    setNotice("");
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);
    setError("");
    setNotice("");

    try {
      await deleteClient(deleteTarget.id);
      setNotice(t("clients.deleteSuccess"));
      setDeleteTarget(null);
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
        eyebrow={t("clients.eyebrow")}
        title={t("clients.title")}
        description={t("clients.description")}
      />

      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t("clients.searchLabel")}</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("clients.searchPlaceholder")}
            className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
          />
        </label>
        <button
          type="button"
          onClick={openCreateForm}
          className="h-11 rounded-md bg-[var(--alumex-blue)] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[var(--alumex-blue-dark)]"
        >
          {t("clients.newClient")}
        </button>
      </div>

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

      {isFormOpen ? (
        <SectionCard
          title={
            editingClient ? t("clients.editClient") : t("clients.newClient")
          }
        >
          <ClientForm
            client={editingClient}
            onSubmit={handleSubmit}
            onCancel={closeForm}
          />
        </SectionCard>
      ) : null}

      <section className="grid gap-4 lg:hidden">
        {filteredClients.map((client) => (
          <ClientCard
            key={client.id}
            client={client}
            isAdmin={isAdmin}
            onEdit={openEditForm}
            onDelete={handleDelete}
          />
        ))}
      </section>

      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <caption className="sr-only">{t("clients.title")}</caption>
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("clients.fields.clientName")}</th>
                <th className="px-4 py-3">{t("clients.fields.mobile")}</th>
                <th className="px-4 py-3">{t("clients.fields.province")}</th>
                <th className="px-4 py-3">{t("clients.fields.city")}</th>
                <th className="px-4 py-3">{t("clients.fields.email")}</th>
                <th className="px-4 py-3">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredClients.map((client) => (
                <tr key={client.id}>
                  <td className="px-4 py-4 font-bold text-slate-950">
                    {term(client.clientName)}
                  </td>
                  <td className="px-4 py-4 text-slate-700">{client.mobile}</td>
                  <td className="px-4 py-4 text-slate-700">
                    {term(client.province)}
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    {term(client.city)}
                  </td>
                  <td className="px-4 py-4 text-slate-700">{client.email}</td>
                  <td className="px-4 py-4">
                    <div className="flex gap-2">
                      <Link
                        href={`/clients/${client.id}`}
                        className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-[var(--alumex-blue)]"
                      >
                        {t("common.details")}
                      </Link>
                      <button
                        type="button"
                        onClick={() => openEditForm(client)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                      >
                        {t("common.edit")}
                      </button>
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => handleDelete(client)}
                          className="rounded-md border border-danger-text bg-transparent px-3 py-2 text-xs font-bold text-danger-text transition hover:bg-danger-text hover:text-white"
                        >
                          {t("common.delete")}
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredClients.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-bold text-slate-950">
            {t("clients.noClientsFound")}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {t("clients.noClientsDescription")}
          </p>
        </div>
      ) : null}

      {deleteTarget ? (
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
                name: term(deleteTarget.clientName),
              })}
            </p>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTarget(null)}
                className="h-11 rounded-md border border-border bg-surface px-4 text-sm font-bold text-muted-strong transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-muted"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDelete}
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
