"use client";

import Link from 'next/link';
import { useI18n } from '@/components/i18n/I18nProvider';
import { projectBranchLabels, type ProjectBranch } from '@/lib/intake/projectBranch';
import { secondary, useResource } from './ui';

type SharedQuotationProject = {
  id: string;
  project_number: string;
  project_name: string;
  branch: ProjectBranch | null;
  sales_status: string;
  updated_at: string;
};

export function SharedQuotationProjects() {
  const { term } = useI18n();
  const { data, error, loading, reload } = useResource<{ projects: SharedQuotationProject[] }>('/api/shared-quotations');
  const projects = data?.projects ?? [];

  if (!error && !projects.length) return null;

  return <section aria-label={term('Shared quotations')} className="mb-5 overflow-hidden rounded-lg border border-t-2 border-slate-200 border-t-blue-600 bg-white print:hidden">
    <h2 className="px-4 pt-4 text-base font-semibold text-slate-950 sm:px-5">{term('Shared quotations')}</h2>
    {error ? <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
      <p role="alert" className="text-sm text-red-700">{term('Unable to load shared quotations.')}</p>
      <button type="button" disabled={loading} onClick={() => void reload()} className={`${secondary} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700`}>{term('Try again')}</button>
    </div> : <ul className="mt-3 divide-y divide-slate-100">
      {projects.map(project => <li key={project.id} className="flex min-w-0 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:px-5">
        <div className="min-w-0">
          <h3 className="break-words text-base font-semibold leading-6 text-slate-900 [overflow-wrap:anywhere]"><bdi>{project.project_name}</bdi></h3>
          <p className="mt-1 text-sm leading-6 text-slate-600"><bdi>{project.project_number}</bdi>{project.branch && <> · {term(projectBranchLabels[project.branch])}</>}</p>
        </div>
        <Link href={`/quotation/${project.id}`} aria-label={`${term('View quotation / Edit prices')} — ${project.project_number}`} className={`${secondary} inline-flex max-w-full items-center justify-center text-center text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:shrink-0`}>
          {term('View quotation / Edit prices')}
        </Link>
      </li>)}
    </ul>}
  </section>;
}
