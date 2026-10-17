"use client";
import Link from 'next/link';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { SalesWorkspaceData } from '@/lib/offline/types';
import { measurementTasks } from '@/lib/workflow/salesTasks';
import { button, card, Notice, useResource, Workspace } from './ui';

export function OutdoorMobileWorkspace() {
  const { term, formatNumber, formatDateTime } = useI18n();
  const { data, error, loading } = useResource<SalesWorkspaceData>('/api/workspace');
  const tasks = data ? measurementTasks(data.projects, data.actor) : [];
  return <Workspace title={term('Measurement assignments')} description={term('Open an assigned site to record measurements, or register a new project.')} action={<Link href="/intake" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md border border-blue-600 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">{term('New project')}</Link>}>
    <Notice error={error}/>
    <section id="measurement-tasks" aria-label={term('Measurement tasks')}>
      {loading ? <p>{term('Loading saved workspace…')}</p> : <>
        <h2 className="mb-4 text-lg font-semibold">{term('Measurement tasks')} <span className="text-slate-500">· {formatNumber(tasks.length)}</span></h2>
        {!tasks.length ? <p className={card}>{term('No measurement tasks waiting.')}</p> : <ul className="space-y-4">
          {tasks.map(project => <li key={project.id} className={card}>
            <p className="text-xs font-semibold text-blue-700">{term(project.project_number)}</p>
            <h3 className="mt-2 text-lg font-semibold">{project.project_name}</h3>
            <p className="mt-2 text-xs leading-5 text-slate-500">{term('Created by')} <bdi>{project.registeredBy==='Employee'?term('Employee'):project.registeredBy}</bdi><time dateTime={project.created_at} dir="ltr" className="block w-fit max-w-full">{formatDateTime(project.created_at)}</time></p>
            {project.address && <p className="mt-2 text-sm leading-6 text-slate-600">{project.address}</p>}
            {project.phone && <a href={`tel:${project.phone}`} className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-blue-700" dir="ltr">{project.phone}</a>}
            <Link href={`/initial-measurements/${project.id}`} className={`${button} mt-4 block text-center`}>{term('Record measurements')}</Link>
          </li>)}
        </ul>}
      </>}
    </section>
  </Workspace>;
}
