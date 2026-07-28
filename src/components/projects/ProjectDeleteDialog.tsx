"use client";

import { useI18n } from "@/components/i18n/I18nProvider";

type ProjectDeleteDialogProps = {
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ProjectDeleteDialog({
  isDeleting,
  onCancel,
  onConfirm,
}: ProjectDeleteDialogProps) {
  const { t } = useI18n();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-project-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6"
    >
      <div className="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-xl">
        <h2 id="delete-project-title" className="text-lg font-bold text-foreground">
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
            onClick={onCancel}
            className="h-11 rounded-md border border-border bg-surface px-4 text-sm font-bold text-muted-strong transition hover:bg-surface-muted disabled:cursor-not-allowed disabled:text-muted"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onConfirm}
            className="h-11 rounded-md bg-danger-text px-4 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted"
          >
            {isDeleting ? t("common.loading") : t("projects.deleteProject")}
          </button>
        </div>
      </div>
    </div>
  );
}
