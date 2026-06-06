"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCurrentRole } from "@/components/auth/useCurrentRole";
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
  isAdmin,
  isSelected,
  onEdit,
  onSelect,
  onDelete,
}: {
  project: Project;
  isAdmin: boolean;
  isSelected: boolean;
  onEdit: (project: Project) => void;
  onSelect: (projectId: string) => void;
  onDelete: (project: Project) => void;
}) {
  const { t, term } = useI18n();

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          {isAdmin ? (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onSelect(project.id)}
              aria-label={t("projects.selectProject")}
              className="mt-1 h-4 w-4 rounded border-border text-primary"
            />
          ) : null}
          <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {project.projectNumber}
          </p>
          <h2 className="mt-1 text-base font-bold text-slate-950">
            {term(project.projectName)}
          </h2>
          </div>
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
        {isAdmin ? (
          <button
            type="button"
            onClick={() => onDelete(project)}
            className="h-10 flex-1 rounded-md border border-danger-text bg-transparent px-3 text-sm font-bold text-danger-text transition hover:bg-danger-text hover:text-white"
          >
            {t("common.delete")}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function ProjectsModule() {
  const { projects, createProject, updateProject, deleteProjects } = useProjects();
  const { isAdmin } = useCurrentRole();
  const { t, term } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | undefined>();
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

  async function handleSubmit(values: ProjectFormValues) {
    setError("");

    try {
      if (editingProject) {
        await updateProject(editingProject.id, values);
      } else {
        await createProject(values);
      }

      closeForm();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t("projects.saveError"),
      );
    }
  }

  function toggleProjectSelection(projectId: string) {
    setSelectedProjectIds((currentIds) =>
      currentIds.includes(projectId)
        ? currentIds.filter((id) => id !== projectId)
        : [...currentIds, projectId],
    );
  }

  function toggleAllVisibleProjects() {
    const visibleProjectIds = filteredProjects.map((project) => project.id);
    const allVisibleSelected = visibleProjectIds.every((projectId) =>
      selectedProjectIds.includes(projectId),
    );

    setSelectedProjectIds((currentIds) =>
      allVisibleSelected
        ? currentIds.filter((projectId) => !visibleProjectIds.includes(projectId))
        : Array.from(new Set([...currentIds, ...visibleProjectIds])),
    );
  }

  function requestDelete(project: Project) {
    setDeleteTargetIds([project.id]);
    setError("");
    setNotice("");
  }

  function requestBulkDelete() {
    setDeleteTargetIds(selectedProjectIds);
    setError("");
    setNotice("");
  }

  async function confirmDeleteProjects() {
    if (deleteTargetIds.length === 0) {
      return;
    }

    setIsDeleting(true);
    setError("");
    setNotice("");

    try {
      await deleteProjects(deleteTargetIds);
      setSelectedProjectIds((currentIds) =>
        currentIds.filter((projectId) => !deleteTargetIds.includes(projectId)),
      );
      setNotice(
        t("projects.deleteSuccess", { count: deleteTargetIds.length }),
      );
      setDeleteTargetIds([]);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t("projects.deleteError"),
      );
    } finally {
      setIsDeleting(false);
    }
  }

  const allVisibleSelected =
    filteredProjects.length > 0 &&
    filteredProjects.every((project) => selectedProjectIds.includes(project.id));

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

      {isAdmin && selectedProjectIds.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
          <p className="text-sm font-bold text-foreground">
            {t("projects.selectedProjects", {
              count: selectedProjectIds.length,
            })}
          </p>
          <button
            type="button"
            onClick={requestBulkDelete}
            className="h-10 rounded-md border border-danger-text bg-transparent px-4 text-sm font-bold text-danger-text transition hover:bg-danger-text hover:text-white"
          >
            {t("projects.deleteSelectedProjects")}
          </button>
        </div>
      ) : null}

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
            isAdmin={isAdmin}
            isSelected={selectedProjectIds.includes(project.id)}
            onEdit={openEditForm}
            onSelect={toggleProjectSelection}
            onDelete={requestDelete}
          />
        ))}
      </section>

      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <caption className="sr-only">{t("projects.title")}</caption>
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                {isAdmin ? (
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAllVisibleProjects}
                      aria-label={t("projects.selectAllProjects")}
                      className="h-4 w-4 rounded border-border text-primary"
                    />
                  </th>
                ) : null}
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
                  {isAdmin ? (
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedProjectIds.includes(project.id)}
                        onChange={() => toggleProjectSelection(project.id)}
                        aria-label={t("projects.selectProject")}
                        className="h-4 w-4 rounded border-border text-primary"
                      />
                    </td>
                  ) : null}
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
                      {isAdmin ? (
                        <button
                          type="button"
                          onClick={() => requestDelete(project)}
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

      {deleteTargetIds.length > 0 ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-project-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
        >
          <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-xl">
            <h2
              id="delete-project-title"
              className="text-lg font-bold text-foreground"
            >
              {t("projects.deleteProjectTitle")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-strong">
              {t("projects.deleteProjectMessage")}
            </p>
            <div className="mt-4 rounded-lg border border-danger-text/30 bg-danger-surface p-4">
              <p className="text-sm font-bold text-danger-text">
                {t("projects.deleteProjectWarning")}
              </p>
              <ul className="mt-3 list-disc space-y-1 px-5 text-sm text-danger-text">
                <li>{t("projects.deleteWarningProject")}</li>
                <li>{t("projects.deleteWarningQuotations")}</li>
                <li>{t("projects.deleteWarningContracts")}</li>
                <li>{t("projects.deleteWarningOpenings")}</li>
              </ul>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteTargetIds([])}
                className="h-11 rounded-md border border-border bg-surface px-4 text-sm font-bold text-muted-strong transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-muted"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmDeleteProjects}
                className="h-11 rounded-md bg-danger-text px-4 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
              >
                {isDeleting ? t("common.loading") : t("projects.deleteProject")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
