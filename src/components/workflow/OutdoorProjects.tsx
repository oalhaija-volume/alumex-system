'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { matchesProjectSearch } from '@/lib/dashboard/projectSearch';
import { canAccessOutdoorProject } from '@/lib/auth/outdoorTeams';
import type { SalesWorkspaceData } from '@/lib/offline/types';
import { projectStage, stageDetails } from '@/lib/workflow/stages';
import { DashboardProjectFilters } from './DashboardProjectFilters';
import { ProjectNameEditor } from './ProjectNameEditor';
import { button, card, Notice, useResource, Workspace } from './ui';

export function OutdoorProjects() {
  const { term, formatDateTime } = useI18n();
  const { data, error, loading, reload } = useResource<SalesWorkspaceData>('/api/workspace');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const projects = (data?.projects ?? []).filter(project => !project.project_log_only && data && canAccessOutdoorProject(project, data.actor));
  const selected = projects.filter(project => matchesProjectSearch(project, search) && (filter === 'all' || projectStage(project) === filter));

  return <Workspace title="My projects" description="Your registered projects and your team's assignments. Open a project to review its name and saved openings.">
    <Notice error={error}/>
    {loading ? <p role="status">{term('Loading projects…')}</p> : <>
      <DashboardProjectFilters search={search} onSearch={setSearch} filter={filter} onFilter={setFilter} onClear={() => { setSearch(''); setFilter('all'); }} count={selected.length} total={projects.length}/>
      {!selected.length ? <p className={card}>{term(projects.length ? 'No projects match this view.' : 'No projects yet. Start by registering a client.')}</p> : <div className="space-y-4">
        {selected.map(project => <article key={project.id} id={`project-${project.id}`} aria-labelledby={`my-project-title-${project.id}`} className={`${card} scroll-mt-5`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-blue-700">{term(project.project_number)}{project.pending ? ` · ${term('Saved on device')}` : ''}</p>
              <h2 id={`my-project-title-${project.id}`} dir="auto" className="mt-2 break-words text-lg font-semibold">{project.project_name}</h2>
            </div>
            <span className="max-w-full rounded-md bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700">{term(stageDetails(project).label)}</span>
          </div>
          {project.address && <p dir="auto" className="mt-3 break-words text-sm leading-6 text-slate-600">{project.address}</p>}
          <p className="mt-3 text-sm text-slate-700">{term('Measurements by')}: <bdi className="font-semibold">{project.assignedOutdoorSales ?? term('Not assigned')}</bdi></p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{term('Created by')} <bdi>{project.registeredBy === 'Employee' ? term('Employee') : project.registeredBy}</bdi><time dateTime={project.created_at} dir="ltr" className="mt-1 block w-fit max-w-full">{formatDateTime(project.created_at)}</time></p>
          {data && <ProjectNameEditor project={project} actor={data.actor} onSaved={reload}/>}
          {project.structure_readiness === 'ready' && <Link href={`/initial-measurements/${project.id}`} className={`${button} mt-3 inline-flex items-center justify-center`}>{term('Open project')}</Link>}
        </article>)}
      </div>}
    </>}
  </Workspace>;
}
