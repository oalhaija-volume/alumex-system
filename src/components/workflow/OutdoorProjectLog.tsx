'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { matchesProjectSearch } from '@/lib/dashboard/projectSearch';
import type { SalesWorkspaceData } from '@/lib/offline/types';
import { measurementTasks } from '@/lib/workflow/salesTasks';
import { projectStage, stageDetails } from '@/lib/workflow/stages';
import { projectVisitHistory, visitEntryLabel, visitOutcomeLabel } from '@/lib/workflow/projectLog';
import { DashboardProjectFilters } from './DashboardProjectFilters';
import { card, Notice, useResource, Workspace } from './ui';

export function OutdoorProjectLog() {
  const { term, formatDateTime, formatNumber } = useI18n();
  const { data, error, loading } = useResource<SalesWorkspaceData>('/api/workspace');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const projects = data?.projects ?? [];
  const assigned = new Set(data ? measurementTasks(projects, data.actor).map(project => project.id) : []);
  const selected = projects.filter(project => matchesProjectSearch(project, search) && (filter === 'all' || projectStage(project) === filter));

  return <Workspace title={term('Project log')} description={term('Your registered projects, measurement visits and follow-up progress.')}>
    <Notice error={error}/>
    {loading ? <p role="status">{term('Loading saved workspace…')}</p> : <>
      <DashboardProjectFilters search={search} onSearch={setSearch} filter={filter} onFilter={setFilter} onClear={() => { setSearch(''); setFilter('all'); }} count={selected.length} total={projects.length}/>
      {!selected.length ? <p className={card}>{term(projects.length ? 'No projects match this view.' : 'No projects in your log yet.')}</p> : <div className="space-y-4">
        {selected.map(project => {
          const history = projectVisitHistory(project);
          const hasTask = !project.project_log_only && assigned.has(project.id);
          return <article key={project.id} id={`project-${project.id}`} aria-labelledby={`log-title-${project.id}`} className={`${card} scroll-mt-5`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-blue-700">{term(project.project_number)}</p>
                <h2 id={`log-title-${project.id}`} dir="auto" className="mt-2 break-words text-lg font-semibold">{project.project_name}</h2>
              </div>
              <span className={`max-w-full rounded-md px-2.5 py-1.5 text-xs font-semibold ${project.measurement_delayed ? 'bg-amber-50 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>{term(project.measurement_delayed ? 'Awaiting another visit' : stageDetails(project).label)}</span>
            </div>
            {project.address && <p dir="auto" className="mt-3 break-words text-sm leading-6 text-slate-600">{project.address}</p>}
            {project.phone && <a href={`tel:${project.phone}`} dir="ltr" className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-blue-700">{project.phone}</a>}
            <p className="mt-2 text-xs leading-5 text-slate-500">{term('Created by')} <bdi>{project.registeredBy === 'Employee' ? term('Employee') : project.registeredBy}</bdi><time dateTime={project.created_at} dir="ltr" className="block w-fit max-w-full">{formatDateTime(project.created_at)}</time></p>
            {project.measurement_delayed && <div className="mt-4 text-sm leading-6 text-amber-900"><p className="font-semibold">{term(visitOutcomeLabel(project.measurement_delay_reason))}</p><p>{term(project.pending ? 'Visit saved on this device. It will return to Indoor Sales after sync.' : 'Waiting for Indoor Sales to arrange another visit')}</p></div>}
            {project.next_follow_up_at && <p className="mt-3 text-sm text-slate-700">{term('Next follow-up')} <time dateTime={project.next_follow_up_at} dir="ltr" className="mt-1 block w-fit">{formatDateTime(project.next_follow_up_at)}</time>{project.followUpOwner && <bdi className="mt-1 block text-xs text-slate-500">{project.followUpOwner}</bdi>}</p>}
            {hasTask && <Link href={`/initial-measurements/${project.id}`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-blue-700">{term('Record measurements')}</Link>}
            {history.length > 0 && <details className="mt-4 border-t border-slate-200 pt-2">
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-700">{term('Visit history')} <span className="font-normal text-slate-500">· {formatNumber(history.length)}</span></summary>
              <ol className="ms-2 mt-2 space-y-5 border-s border-slate-200 ps-4">
                {history.map(entry => <li key={entry.id} className="text-sm">
                  <p className="font-semibold text-slate-900">{term(visitEntryLabel(entry))}</p>
                  {entry.note && entry.note !== visitEntryLabel(entry) && <p dir="auto" className="mt-1 whitespace-pre-wrap break-words leading-6 text-slate-600">{term(entry.note)}</p>}
                  {entry.assignedOutdoorSales && <p className="mt-1 text-xs text-slate-600">{term('Measurements by')} <bdi>{entry.assignedOutdoorSales}</bdi></p>}
                  <p className="mt-2 text-xs text-slate-500"><bdi>{entry.recordedBy === 'Employee' ? term('Employee') : entry.recordedBy}</bdi><time dateTime={entry.recordedAt} dir="ltr" className="mt-1 block w-fit max-w-full">{formatDateTime(entry.recordedAt)}</time></p>
                  {entry.pending && <p className="mt-1 text-xs text-amber-800">{term('Waiting to sync')}</p>}
                </li>)}
              </ol>
            </details>}
          </article>;
        })}
      </div>}
    </>}
  </Workspace>;
}
