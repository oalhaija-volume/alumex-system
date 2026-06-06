"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/I18nProvider";
import { PageHeader } from "@/components/PageHeader";
import { ProjectForm, type ProjectFormValues } from "@/components/projects/ProjectForm";
import { useProjects } from "@/components/projects/ProjectsProvider";
import { StructuralOpenings } from "@/components/projects/StructuralOpenings";
import { SectionCard } from "@/components/SectionCard";
import { StatusPill } from "@/components/StatusPill";

const details: Array<[string, keyof ProjectFormValues]> = [
  ["projects.fields.projectNumber", "projectNumber"],
  ["projects.fields.projectName", "projectName"],
  ["projects.fields.client", "client"],
  ["projects.fields.address", "address"],
  ["projects.fields.projectType", "projectType"],
  ["projects.fields.salesEngineer", "salesEngineer"],
  ["projects.fields.status", "status"],
];

export function ProjectDetails() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const { t, term } = useI18n();
  const {
    findProject,
    updateProject,
    addOpening,
    updateOpening,
    deleteOpening,
    duplicateOpening,
  } = useProjects();
  const project = findProject(params.projectId);

  if (!project) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("projects.eyebrow")}
          title={t("projects.projectNotFound")}
          description={t("projects.projectNotFoundDescription")}
        />
        <Link
          href="/projects"
          className="inline-flex h-11 items-center rounded-md bg-[var(--alumex-blue)] px-4 text-sm font-bold text-white"
        >
          {t("projects.backToProjects")}
        </Link>
      </div>
    );
  }

  const activeProject = project;

  function handleSubmit(values: ProjectFormValues) {
    updateProject(activeProject.id, values);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("projects.detailsEyebrow")}
        title={term(activeProject.projectName)}
        description={t("projects.detailsDescription")}
      />

      <div className="flex flex-wrap gap-2">
        <Link
          href="/projects"
          className="inline-flex h-11 items-center rounded-md border border-border bg-surface px-4 text-sm font-bold text-muted-strong"
        >
          {t("projects.backToProjects")}
        </Link>
        {activeProject.structuralOpenings.length > 0 ? (
          <Link
            href={`/quotations?projectId=${activeProject.id}`}
            className="inline-flex h-11 items-center rounded-md bg-primary px-4 text-sm font-bold text-white"
          >
            {t("quotations.generateQuotation")}
          </Link>
        ) : (
          <span className="inline-flex min-h-11 items-center rounded-md border border-dashed border-border bg-surface-muted px-4 text-sm font-semibold text-muted">
            {t("projects.openings.addOpeningBeforeQuotation")}
          </span>
        )}
      </div>

      <section className="grid gap-4 lg:grid-cols-[0.75fr_1.25fr]">
        <SectionCard title={t("projects.projectInformation")}>
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
                  {key === "status" ? (
                    <StatusPill status={activeProject.status} />
                  ) : (
                    activeProject[key] ? term(String(activeProject[key])) : t("common.notAdded")
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </SectionCard>

        <SectionCard title={t("projects.editProject")}>
          <ProjectForm
            project={activeProject}
            onSubmit={handleSubmit}
            onCancel={() => router.push("/projects")}
          />
        </SectionCard>
      </section>

      <StructuralOpenings
        openings={activeProject.structuralOpenings}
        onAdd={(opening) => addOpening(activeProject.id, opening)}
        onUpdate={(openingId, opening) =>
          updateOpening(activeProject.id, openingId, opening)
        }
        onDelete={(openingId) => deleteOpening(activeProject.id, openingId)}
        onDuplicate={(openingId) =>
          duplicateOpening(activeProject.id, openingId)
        }
      />
    </div>
  );
}
