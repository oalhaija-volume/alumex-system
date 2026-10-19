'use client';
import { useProjectRegistrationFilters } from './useProjectRegistrationFilters';
import Link from 'next/link';
import { useState } from 'react';
import { DashboardProjectFilters } from './DashboardProjectFilters';
import { matchesProjectSearch } from '@/lib/dashboard/projectSearch';
import { useI18n } from '@/components/i18n/I18nProvider';
import { canAccessRoute, type AppRole } from '@/lib/auth/permissions';
import type { EmployeeDashboardData } from '@/lib/workflow/dashboard';
import { projectStage, projectStages, stageDetails } from '@/lib/workflow/stages';
import { button, card, Notice, useResource, Workspace } from './ui';

export function CompanyDashboard({ role }: { role: AppRole }) {
  const { term, formatNumber, formatDateTime } = useI18n();
  const { data, error, loading } = useResource<EmployeeDashboardData>('/api/dashboard');
  const [stage, setStage] = useState('all');
  const [search, setSearch] = useState('');
  const registration = useProjectRegistrationFilters(data?.projects ?? []);
  const projects = registration.filteredProjects;
  const selected = projects.filter(project => (stage === 'all' || projectStage(project) === stage)
    && matchesProjectSearch(project, search));
  return <Workspace title={term('Dashboard')} description={term('Company project progress, from site readiness to Operations.')}>
    <Notice error={error} />
    <div className="mb-6 flex flex-wrap gap-3">
      {canAccessRoute('/operations', role) && <Link href="/operations" className={button}>{term('Open Operations')}</Link>}
      {canAccessRoute('/hr', role) && <Link href="/hr" className={button}>{term('Employees')}</Link>}
    </div>
    {loading ? <p role="status">{term('Loading project stages…')}</p> : <>
      <DashboardProjectFilters registration={registration} search={search} onSearch={setSearch} filter={stage} onFilter={setStage} onClear={() => { setStage('all'); setSearch(''); registration.reset(); }} count={selected.length} total={data?.projects.length??0} contactSearch={false} />
      <section aria-label={term('Project stages')} className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {projectStages.map(item => <button key={item.id} type="button" aria-pressed={stage === item.id}
          onClick={() => setStage(stage === item.id ? 'all' : item.id)}
          className={`min-h-28 rounded-lg border p-4 text-start ${stage === item.id ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white'}`}>
          <span className="block text-sm font-medium text-slate-600">{term(item.label)}</span>
          <span className="mt-2 block text-3xl font-semibold">{formatNumber(projects.filter(p => projectStage(p) === item.id).length)}</span>
        </button>)}
      </section>
      <section className="mt-8">
        <h2 className="mb-4 text-lg font-semibold">{term(stage === 'all' ? 'All projects' : projectStages.find(item => item.id === stage)?.label)} · {formatNumber(selected.length)}</h2>
        {!selected.length ? <p className={card}>{term('No projects match this view.')}</p> : <div className="space-y-3">{selected.map(project => <article key={project.id} className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-semibold text-blue-700">{project.project_number}</p><h3 className="mt-1 font-semibold">{project.project_name}</h3></div>
            <span className="rounded-md bg-slate-100 px-3 py-2 text-xs font-medium">{term(stageDetails(project).label)}</span>
          </div>
          <p className="mt-3 text-xs text-slate-500">{term('Last updated')}: {formatDateTime(project.updated_at)}</p>
        </article>)}</div>}
      </section>
    </>}
  </Workspace>;
}
