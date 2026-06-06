"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
  onEdit,
  onDelete,
}: {
  client: Client;
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
        <button
          type="button"
          onClick={() => onDelete(client)}
          className="h-10 flex-1 rounded-md border border-red-200 bg-red-50 px-3 text-sm font-bold text-red-700"
        >
          {t("common.delete")}
        </button>
      </div>
    </article>
  );
}

export function ClientsModule() {
  const { clients, createClient, updateClient, deleteClient } = useClients();
  const { t, term } = useI18n();
  const [search, setSearch] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | undefined>();

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

  function handleSubmit(values: ClientFormValues) {
    if (editingClient) {
      updateClient(editingClient.id, values);
    } else {
      createClient(values);
    }

    closeForm();
  }

  function handleDelete(client: Client) {
    const confirmed = window.confirm(
      t("clients.deleteConfirm", { name: term(client.clientName) }),
    );

    if (confirmed) {
      deleteClient(client.id);
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
                      <button
                        type="button"
                        onClick={() => handleDelete(client)}
                        className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700"
                      >
                        {t("common.delete")}
                      </button>
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
    </div>
  );
}
