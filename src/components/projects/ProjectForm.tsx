"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useClients } from "@/components/clients/ClientsProvider";
import { useI18n } from "@/components/i18n/I18nProvider";
import { projectStatuses, type Project, type ProjectStatus } from "@/data/ui";

export type ProjectFormValues = Omit<Project, "id" | "structuralOpenings">;

const emptyProject: ProjectFormValues = {
  projectNumber: "",
  projectName: "",
  client: "",
  address: "",
  projectType: "",
  salesEngineer: "",
  status: "Draft",
};

const fields: Array<{
  key: keyof ProjectFormValues;
  label: string;
  type?: "textarea" | "select";
  required?: boolean;
}> = [
  { key: "projectNumber", label: "projects.fields.projectNumber" },
  { key: "projectName", label: "projects.fields.projectName", required: true },
  { key: "client", label: "projects.fields.client", required: true },
  { key: "projectType", label: "projects.fields.projectType", required: true },
  { key: "salesEngineer", label: "projects.fields.salesEngineer" },
  { key: "status", label: "projects.fields.status", type: "select", required: true },
  { key: "address", label: "projects.fields.address", type: "textarea", required: true },
];

export function ProjectForm({
  project,
  onSubmit,
  onCancel,
}: {
  project?: Project;
  onSubmit: (values: ProjectFormValues) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<ProjectFormValues>(
    project
      ? {
          projectNumber: project.projectNumber,
          projectName: project.projectName,
          client: project.client,
          address: project.address,
          projectType: project.projectType,
          salesEngineer: project.salesEngineer,
          status: project.status,
        }
      : emptyProject,
  );
  const [error, setError] = useState("");
  const { clients } = useClients();
  const { t, term } = useI18n();

  function updateValue(key: keyof ProjectFormValues, value: string) {
    setValues((currentValues) => ({
      ...currentValues,
      [key]: key === "status" ? (value as ProjectStatus) : value,
    }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (
      !values.client.trim() ||
      !values.projectName.trim() ||
      !values.address.trim() ||
      !values.projectType.trim() ||
      !values.status
    ) {
      setError(t("projects.validationRequired"));
      return;
    }

    onSubmit({
      projectNumber: values.projectNumber.trim(),
      projectName: values.projectName.trim(),
      client: values.client.trim(),
      address: values.address.trim(),
      projectType: values.projectType.trim(),
      salesEngineer: values.salesEngineer.trim(),
      status: values.status,
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
          const id = `project-${field.key}`;
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
                  required={field.required}
                  value={values[field.key]}
                  onChange={(event) => updateValue(field.key, event.target.value)}
                  rows={3}
                  className={`${commonClasses} py-3`}
                />
              ) : field.key === "client" ? (
                <select
                  id={id}
                  required={field.required}
                  value={values.client}
                  onChange={(event) => updateValue(field.key, event.target.value)}
                  className={`${commonClasses} h-11`}
                >
                  <option value="">{t("projects.fields.client")}</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.clientName}>
                      {term(client.clientName)}
                    </option>
                  ))}
                </select>
              ) : field.type === "select" ? (
                <select
                  id={id}
                  required={field.required}
                  value={values.status}
                  onChange={(event) => updateValue(field.key, event.target.value)}
                  className={`${commonClasses} h-11`}
                >
                  {projectStatuses.map((status) => (
                    <option key={status} value={status}>
                      {term(status)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={id}
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
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="h-11 rounded-md border border-border bg-surface px-4 text-sm font-bold text-muted-strong transition hover:bg-surface-muted"
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          className="h-11 rounded-md bg-primary px-4 text-sm font-bold text-white shadow-sm transition hover:bg-primary-hover"
        >
          {project ? t("common.saveChanges") : t("projects.newProject")}
        </button>
      </div>
    </form>
  );
}
