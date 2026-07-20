"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { ProjectLocationPicker } from "@/components/projects/ProjectLocationPicker";
import type { Client } from "@/data/ui";

export type ClientFormValues = Omit<Client, "id">;
type ClientTextFieldKey = Exclude<
  keyof ClientFormValues,
  "locationLatitude" | "locationLongitude"
>;

const emptyClient: ClientFormValues = {
  clientName: "",
  mobile: "",
  alternateMobile: "",
  address: "",
  province: "",
  city: "",
  email: "",
  notes: "",
  locationLatitude: null,
  locationLongitude: null,
};

const fields: Array<{
  key: ClientTextFieldKey;
  label: string;
  type?: "email" | "tel" | "textarea";
  required?: boolean;
}> = [
  { key: "clientName", label: "clients.fields.clientName", required: true },
  { key: "mobile", label: "clients.fields.mobile", type: "tel", required: true },
  { key: "alternateMobile", label: "clients.fields.alternateMobile", type: "tel" },
  { key: "address", label: "clients.fields.address", required: true },
  { key: "province", label: "clients.fields.province" },
  { key: "city", label: "clients.fields.city" },
  { key: "email", label: "clients.fields.email", type: "email" },
  { key: "notes", label: "clients.fields.notes", type: "textarea" },
];

export function ClientForm({
  client,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: {
  client?: Client;
  onSubmit: (values: ClientFormValues) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}) {
  const [values, setValues] = useState<ClientFormValues>(
    client
      ? {
          clientName: client.clientName,
          mobile: client.mobile,
          alternateMobile: client.alternateMobile,
          address: client.address,
          province: client.province,
          city: client.city,
          email: client.email,
          notes: client.notes,
          locationLatitude: client.locationLatitude ?? null,
          locationLongitude: client.locationLongitude ?? null,
        }
      : emptyClient,
  );
  const [error, setError] = useState("");
  const { t } = useI18n();

  function updateValue(key: ClientTextFieldKey, value: string) {
    setValues((currentValues) => ({
      ...currentValues,
      [key]: value,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!values.clientName.trim() || !values.mobile.trim() || !values.address.trim()) {
      setError(t("clients.validationRequired"));
      return;
    }

    onSubmit({
      clientName: values.clientName.trim(),
      mobile: values.mobile.trim(),
      alternateMobile: values.alternateMobile.trim(),
      address: values.address.trim(),
      province: values.province.trim(),
      city: values.city.trim(),
      email: values.email.trim(),
      notes: values.notes.trim(),
      locationLatitude: values.locationLatitude ?? null,
      locationLongitude: values.locationLongitude ?? null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((field) => {
          const id = `client-${field.key}`;
          const commonClasses =
            "mt-2 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-primary focus:ring-4 focus:ring-info-surface";

          return (
            <label
              key={field.key}
              className={field.type === "textarea" ? "md:col-span-2" : ""}
              htmlFor={id}
            >
              <span className="text-sm font-bold text-muted-strong">
                {t(field.label)}
              </span>
              {field.type === "textarea" ? (
                <textarea
                  id={id}
                  value={values[field.key]}
                  onChange={(event) => updateValue(field.key, event.target.value)}
                  rows={4}
                  className={`${commonClasses} py-3`}
                />
              ) : (
                <input
                  id={id}
                  type={field.type ?? "text"}
                  required={field.required}
                  value={values[field.key]}
                  onChange={(event) => updateValue(field.key, event.target.value)}
                  className={`${commonClasses} h-11`}
                />
              )}
            </label>
          );
        })}
      </div>
      <ProjectLocationPicker
        latitude={values.locationLatitude}
        longitude={values.locationLongitude}
        onChange={(location) =>
          setValues((currentValues) => ({
            ...currentValues,
            locationLatitude: location.latitude,
            locationLongitude: location.longitude,
          }))
        }
        enableSearch
        showGeofence={false}
        title={t("clients.location.title")}
        editableDescription={t("clients.location.description")}
        readOnlyDescription={t("clients.location.readOnlyDescription")}
        mapAriaLabel={t("clients.location.mapAriaLabel")}
        searchLabel={t("clients.location.searchLabel")}
        searchPlaceholder={t("clients.location.searchPlaceholder")}
        searchButtonLabel={t("common.search")}
        searchingLabel={t("clients.location.searching")}
        noResultsLabel={t("clients.location.noResults")}
        searchErrorLabel={t("clients.location.searchError")}
        onSearchSelect={(address) =>
          setValues((currentValues) => ({
            ...currentValues,
            address,
          }))
        }
      />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onCancel}
          className="h-11 rounded-md border border-border bg-surface px-4 text-sm font-bold text-muted-strong transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-muted"
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="h-11 rounded-md bg-primary px-4 text-sm font-bold text-white shadow-sm transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
        >
          {isSubmitting
            ? t("common.loading")
            : client
              ? t("common.saveChanges")
              : t("clients.newClient")}
        </button>
      </div>
    </form>
  );
}
