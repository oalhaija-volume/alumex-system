"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { PageHeader } from "@/components/PageHeader";
import { ProjectForm, type ProjectFormValues } from "@/components/projects/ProjectForm";
import { useProjects } from "@/components/projects/ProjectsProvider";
import { SectionCard } from "@/components/SectionCard";
import { StatusPill } from "@/components/StatusPill";
import { projectStatuses, type Project, type ProjectStatus } from "@/data/ui";

type StatusFilter = "All" | ProjectStatus;

function matchesSearch(project: Project, search: string) {
  const term = search.trim().toLowerCase();

  if (!term) {
    return true;
  }

  return [
    project.projectNumber,
    project.projectName,
    project.client,
    project.address,
    project.projectType,
    project.salesEngineer,
    project.status,
  ]
    .join(" ")
    .toLowerCase()
    .includes(term);
}

function ProjectCard({
  project,
  onEdit,
}: {
  project: Project;
  onEdit: (project: Project) => void;
}) {
  const { t, term } = useI18n();

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {project.projectNumber}
          </p>
          <h2 className="mt-1 text-base font-bold text-slate-950">
            {term(project.projectName)}
          </h2>
        </div>
        <StatusPill status={project.status} />
      </div>
      <div className="mt-4 grid gap-2 text-sm text-slate-600">
        <p>
          <span className="font-bold text-slate-800">
            {t("projects.fields.client")}:
          </span>{" "}
          {term(project.client)}
        </p>
        <p>
          <span className="font-bold text-slate-800">
            {t("projects.fields.type")}:
          </span>{" "}
          {term(project.projectType)}
        </p>
        <p>
          <span className="font-bold text-slate-800">
            {t("projects.fields.salesEngineer")}:
          </span>{" "}
          {term(project.salesEngineer)}
        </p>
      </div>
      <div className="mt-4 flex gap-2">
        <Link
          href={`/projects/${project.id}`}
          className="flex h-10 flex-1 items-center justify-center rounded-md border border-blue-100 bg-blue-50 px-3 text-sm font-bold text-[var(--alumex-blue)]"
        >
          {t("common.details")}
        </Link>
        <button
          type="button"
          onClick={() => onEdit(project)}
          className="h-10 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700"
        >
          {t("common.edit")}
        </button>
      </div>
    </article>
  );
}

export function ProjectsModule() {
  const { projects, createProject, updateProject } = useProjects();
  const { t, term } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | undefined>();

  const filteredProjects = useMemo(
    () =>
      projects.filter(
        (project) =>
          matchesSearch(project, search) &&
          (statusFilter === "All" || project.status === statusFilter),
      ),
    [projects, search, statusFilter],
  );

  function openCreateForm() {
    setEditingProject(undefined);
    setIsFormOpen(true);
  }

  function openEditForm(project: Project) {
    setEditingProject(project);
    setIsFormOpen(true);
  }

  function closeForm() {
    setEditingProject(undefined);
    setIsFormOpen(false);
  }

  function handleSubmit(values: ProjectFormValues) {
    if (editingProject) {
      updateProject(editingProject.id, values);
    } else {
      createProject(values);
    }

    closeForm();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("projects.eyebrow")}
        title={t("projects.title")}
        description={t("projects.description")}
      />

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_220px_auto] lg:items-center">
        <label>
          <span className="sr-only">{t("projects.searchLabel")}</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("projects.searchPlaceholder")}
            className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
          />
        </label>
        <label>
          <span className="sr-only">{t("projects.filterByStatus")}</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[var(--alumex-blue)] focus:ring-4 focus:ring-blue-100"
          >
            <option value="All">{t("common.allStatuses")}</option>
            {projectStatuses.map((status) => (
              <option key={status} value={status}>
                {term(status)}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={openCreateForm}
          className="h-11 rounded-md bg-[var(--alumex-blue)] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[var(--alumex-blue-dark)]"
        >
          {t("projects.newProject")}
        </button>
      </div>

      {isFormOpen ? (
        <SectionCard
          title={
            editingProject
              ? t("projects.editProject")
              : t("projects.newProject")
          }
        >
          <ProjectForm
            project={editingProject}
            onSubmit={handleSubmit}
            onCancel={closeForm}
          />
        </SectionCard>
      ) : null}

      <section className="grid gap-4 lg:hidden">
        {filteredProjects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onEdit={openEditForm}
          />
        ))}
      </section>

      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <caption className="sr-only">{t("projects.title")}</caption>
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t("projects.fields.projectNumber")}</th>
                <th className="px-4 py-3">{t("projects.fields.projectName")}</th>
                <th className="px-4 py-3">{t("projects.fields.client")}</th>
                <th className="px-4 py-3">{t("projects.fields.projectType")}</th>
                <th className="px-4 py-3">{t("projects.fields.salesEngineer")}</th>
                <th className="px-4 py-3">{t("projects.fields.status")}</th>
                <th className="px-4 py-3">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProjects.map((project) => (
                <tr key={project.id}>
                  <td className="px-4 py-4 font-bold text-slate-950">
                    {project.projectNumber}
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    {term(project.projectName)}
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    {term(project.client)}
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    {term(project.projectType)}
                  </td>
                  <td className="px-4 py-4 text-slate-700">
                    {term(project.salesEngineer)}
                  </td>
                  <td className="px-4 py-4">
                    <StatusPill status={project.status} />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex gap-2">
                      <Link
                        href={`/projects/${project.id}`}
                        className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-[var(--alumex-blue)]"
                      >
                        {t("common.details")}
                      </Link>
                      <button
                        type="button"
                        onClick={() => openEditForm(project)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
                      >
                        {t("common.edit")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-bold text-slate-950">
            {t("projects.noProjectsFound")}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {t("projects.noProjectsDescription")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
