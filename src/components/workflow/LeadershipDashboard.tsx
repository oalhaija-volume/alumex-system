"use client";
import { useProjectRegistrationFilters } from './useProjectRegistrationFilters';
import { MeasurementDelayNotice } from '@/components/measurements/MeasurementDelayNotice';

import { DashboardProjectFilters } from './DashboardProjectFilters';
import { matchesProjectSearch } from '@/lib/dashboard/projectSearch';
import Link from 'next/link';
import { Noto_Sans_Arabic } from 'next/font/google';
import { useState } from 'react';
import { isLeadershipRole } from '@/lib/auth/permissions';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { FieldProject, SalesWorkspaceData } from '@/lib/offline/types';
import { needsSalesFollowUp, projectLink, projectStage, projectStages, stageDetails, type ProjectStage } from '@/lib/workflow/stages';
import { ProjectFollowUps } from './ProjectFollowUps';
import { SalesTaskPanel } from './SalesTaskPanel';
import { OutdoorSalesCoverage } from './OutdoorSalesCoverage';
import { ClientNameEditor } from './ClientNameEditor';
import { ProjectNameEditor } from './ProjectNameEditor';
import { IndoorSalesEditor, type SavedIndoorSalesAssignment } from './IndoorSalesEditor';
import { button, field, Notice, secondary } from './ui';
import styles from './LeadershipDashboard.module.css';

const dashboardArabic = Noto_Sans_Arabic({
  weight: 'variable',
  subsets: ['arabic'],
  display: 'swap',
  preload: false,
  variable: '--font-dashboard-arabic',
});

export const dashboardTones = {
  slate: { surface: 'border-slate-300 bg-slate-100 text-slate-800', dot: 'bg-slate-500', edge: 'border-t-slate-500' },
  blue: { surface: 'border-blue-200 bg-blue-50 text-blue-900', dot: 'bg-blue-600', edge: 'border-t-blue-600' },
  amber: { surface: 'border-amber-200 bg-amber-50 text-amber-950', dot: 'bg-amber-500', edge: 'border-t-amber-500' },
  violet: { surface: 'border-violet-200 bg-violet-50 text-violet-900', dot: 'bg-violet-600', edge: 'border-t-violet-600' },
  teal: { surface: 'border-teal-200 bg-teal-50 text-teal-900', dot: 'bg-teal-600', edge: 'border-t-teal-600' },
  emerald: { surface: 'border-emerald-200 bg-emerald-50 text-emerald-900', dot: 'bg-emerald-600', edge: 'border-t-emerald-600' },
  rose: { surface: 'border-rose-200 bg-rose-50 text-rose-900', dot: 'bg-rose-600', edge: 'border-t-rose-600' },
};
export const dashboardStageTone: Record<ProjectStage, keyof typeof dashboardTones> = {
  site: 'slate', measurements: 'blue', 'measurement-delayed': 'amber', 'quotation-preparation': 'amber', 'quotation-response': 'amber',
  'contract-preparation': 'violet', 'contract-signature': 'violet', handoff: 'teal', operations: 'emerald', closed: 'slate', 'client-cancelled': 'rose',
};
type Scope = 'all' | 'sales' | 'overdue' | 'operations' | 'unscheduled';
type ProjectEditors = {
  onProjectSaved?: () => Promise<void>;
  onClientNameSaved?: (project: FieldProject, clientName: string) => Promise<void>;
  onIndoorSalesSaved?: (assignment: SavedIndoorSalesAssignment) => Promise<void>;
};

function actionFor(project: FieldProject, leadership: boolean) {
  const stage = projectStage(project);
  if (stage === 'site') return { href: `/mini-crm#project-${project.id}`, label: 'Follow up on site readiness' };
  if (stage === 'measurement-delayed') return { href: projectLink(project), label: 'Open CRM' };
  if (stage === 'client-cancelled') return { href: projectLink(project), label: 'Review the project record' };
  if (stage === 'measurements') return { href: projectLink(project), label: 'Review measurements' };
  if (stage === 'quotation-preparation') return { href: projectLink(project), label: 'Prepare the quotation' };
  if (stage === 'quotation-response') return { href: projectLink(project), label: 'Open quotation' };
  if (stage === 'contract-preparation') return { href: projectLink(project), label: 'Prepare the contract' };
  if (stage === 'contract-signature') return { href: projectLink(project), label: 'Open contract' };
  if (stage === 'handoff' || stage === 'operations') return leadership ? { href: '/operations', label: 'Open Operations' } : { href: projectLink(project), label: 'Open contract' };
  return { href: `/projects/${project.id}/follow-ups`, label: 'Review the project record' };
}

function ProjectRow({ project, data, leadership, overdue, busy, onDelete, onProjectSaved, onClientNameSaved, onIndoorSalesSaved }: {
  project: FieldProject;
  data: SalesWorkspaceData;
  leadership: boolean;
  overdue: boolean;
  busy: string;
  onDelete?: (project: FieldProject) => Promise<void>;
} & ProjectEditors) {
  const { term, formatDateTime } = useI18n();
  const [expanded, setExpanded] = useState<'details' | 'history' | null>(null);
  const currentStage = projectStage(project);
  const details = stageDetails(project);
  const tone = dashboardTones[dashboardStageTone[currentStage]];
  const action = actionFor(project, leadership);
  const outdoor = project.assignedOutdoorSales ?? (!project.assigned_outdoor_sales_id && (project.original_creator_role === 'Outdoor Sales' || data.outdoorSales?.some(employee => employee.id === project.created_by)) ? project.registeredBy : null);
  const panelId = `project-panel-${project.id}`;
  const compactControl = 'inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2.5 text-sm! font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700';

  return <article aria-labelledby={`project-name-${project.id}`} className={`min-w-0 rounded-lg border border-t-2 border-slate-200 bg-white ${tone.edge}`}>
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-full flex-wrap items-baseline gap-x-3 gap-y-1 xl:basis-0">
          <h3 id={`project-name-${project.id}`} className="min-w-0 break-words text-base font-semibold leading-7 text-slate-950 [overflow-wrap:anywhere]">
            <Link href={action.href} className="rounded-sm hover:text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">{project.project_name}</Link>
          </h3>
          <span className="text-sm text-slate-600"><bdi>{term(project.project_number)}</bdi>{project.branch && <span> · {term(project.branch === 'Governorates' ? 'Governorates' : project.branch === 'Karkh' ? 'From Karkh' : 'From Rasafa')}{project.governorate && <> · <bdi>{project.governorate}</bdi></>}</span>}</span>
          {project.pending && <span className="text-sm text-slate-600">{term('Saved on device')}</span>}
          {project.client_name && <p className="basis-full break-words text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{term('Client name')}: <bdi className="font-medium text-slate-800">{project.client_name}</bdi></p>}
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[13px] font-semibold ${tone.surface}`}><span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`}/>{term(details.label)}</span>
        <div className="ms-auto flex max-w-full items-center gap-2 xl:ms-0">
          <Link href={action.href} title={`${term('Next step')}: ${term(details.action)}`} className={`${compactControl} bg-blue-600 px-3 font-semibold text-white hover:bg-blue-700`}>{term(action.label)}</Link>
          {data.actor.role === 'Admin' && onDelete && <button type="button" aria-label={term(busy === project.id ? 'Please wait…' : 'Delete project')} title={term(busy === project.id ? 'Please wait…' : 'Delete project')} disabled={!!busy || project.pending} onClick={() => void onDelete(project)} className={`${compactControl} min-w-11 shrink-0 text-red-700 hover:bg-red-50 disabled:opacity-50`}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>
          </button>}
        </div>
      </div>
      <div className="mt-4 grid gap-3 border-t border-slate-100 pt-3">
        <dl className="grid min-w-0 gap-x-5 gap-y-2 text-sm leading-6 sm:grid-cols-2 xl:grid-cols-4">
          {needsSalesFollowUp(project) && <div className={`min-w-0 break-words ${overdue ? 'rounded bg-rose-50 px-1.5 text-rose-800' : 'text-slate-600'}`}><dt className="inline">{term(overdue ? 'Overdue follow-up' : 'Next follow-up')}: </dt><dd className={`inline font-semibold tabular-nums ${overdue ? '' : 'text-slate-900'}`}>{project.next_follow_up_at ? <time dateTime={project.next_follow_up_at}>{formatDateTime(project.next_follow_up_at)}</time> : term('Follow-up date not set')}</dd></div>}
          <div className="min-w-0 break-words [overflow-wrap:anywhere]"><dt className="inline text-slate-500">{term('Created by')}: </dt><dd className="inline font-medium text-slate-800"><bdi>{project.registeredBy === 'Employee' ? term('Employee') : project.registeredBy}</bdi></dd></div>
          {project.legacy_outdoor_sales_id&&<div className="min-w-0 break-words text-red-800 [overflow-wrap:anywhere]"><dt className="inline">{term('Original Outdoor Sales owner')}: </dt><dd className="inline font-semibold"><bdi>{project.legacyOutdoorSalesOwner??term('Employee')}</bdi></dd></div>}
          <div className="min-w-0 break-words"><dt className="inline text-slate-500">{term('Responsible Indoor Sales')}: </dt><dd className="inline font-medium text-slate-800"><bdi>{project.followUpOwner ?? term('Not assigned')}</bdi></dd></div>
          <div className="min-w-0 break-words"><dt className="inline text-slate-500">{term('Measurements by')}: </dt><dd className="inline font-medium text-slate-800"><bdi>{outdoor ?? term('Not assigned')}</bdi></dd></div>
        </dl>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-2">
          {currentStage !== 'site' && currentStage !== 'closed' && needsSalesFollowUp(project) && <Link href={`/mini-crm#project-${project.id}`} className={`${compactControl} text-blue-700 hover:bg-blue-50`}>{term('Follow up')}</Link>}
          {(['details', 'history'] as const).map(panel => <button key={panel} type="button" aria-expanded={expanded === panel} aria-controls={panelId} onClick={() => setExpanded(expanded === panel ? null : panel)} className={`${compactControl} ${expanded === panel ? 'bg-slate-100 text-slate-950' : 'text-slate-600 hover:bg-slate-50'}`}>
            {term(panel === 'details' ? 'Project details' : 'Follow-up history')}
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={expanded === panel ? 'rotate-180' : ''}><path d="m4 6 4 4 4-4"/></svg>
          </button>)}
        </div>
      </div>
      {data.actor.role === 'Admin' && project.pending && <p className="mt-1 text-xs text-slate-500">{term('Sync saved changes before deleting.')}</p>}
    </div>
    <div id={panelId} hidden={!expanded}>
      {expanded === 'details' && <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
        <dl className="grid gap-x-6 gap-y-3 text-sm leading-6 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-slate-500">{term('Next step')}</dt><dd className="font-medium text-slate-800">{term(details.action)}</dd></div>
          <div><dt className="text-slate-500">{term('Phone')}</dt><dd>{project.phone ? <a href={`tel:${project.phone}`} className="inline-flex min-h-9 items-center text-blue-700" dir="ltr">{project.phone}</a> : '—'}</dd></div>
          <div><dt className="text-slate-500">{term('Created by')}</dt><dd><bdi>{project.registeredBy === 'Employee' ? term('Employee') : project.registeredBy}</bdi><time dateTime={project.created_at} className="block text-slate-500">{formatDateTime(project.created_at)}</time></dd></div>
          <div><dt className="text-slate-500">{term('Last updated')}</dt><dd>{formatDateTime(project.updated_at)}</dd></div>
          <div className="sm:col-span-2"><dt className="text-slate-500">{term('Address')}</dt><dd className="break-words">{project.address ?? '—'}</dd></div>
          {project.readiness_note && <div className="sm:col-span-2"><dt className="text-slate-500">{term('Reason not ready for measurement')}</dt><dd dir="auto" className="whitespace-pre-wrap break-words">{project.readiness_note}</dd></div>}
          {project.project_notes && <div className="sm:col-span-2"><dt className="text-slate-500">{term('Latest follow-up note')}</dt><dd className="whitespace-pre-wrap break-words">{project.project_notes}</dd></div>}
        </dl>
        <MeasurementDelayNotice project={project}/>
        {(onProjectSaved || onClientNameSaved || onIndoorSalesSaved) && <div className="mt-3 grid gap-x-6 border-t border-slate-200 pt-1 sm:grid-cols-2">
          <div>{onProjectSaved && <ProjectNameEditor project={project} actor={data.actor} onSaved={onProjectSaved}/>}{onClientNameSaved && <ClientNameEditor project={project} actor={data.actor} onSaved={clientName => onClientNameSaved(project, clientName)}/>}</div>
          {onIndoorSalesSaved && <IndoorSalesEditor project={project} data={data} onSaved={onIndoorSalesSaved}/>}
        </div>}
      </div>}
      {expanded === 'history' && <ProjectFollowUps projectId={project.id}/>}
    </div>
  </article>;
}

export function LeadershipDashboard({ data, error, now, notice = '', busy = '', onDelete, onProjectSaved, onClientNameSaved, onIndoorSalesSaved }: {
  data: SalesWorkspaceData; error: string; now: number; notice?: string; busy?: string;
  onDelete?: (project: FieldProject) => Promise<void>;
} & ProjectEditors) {
  const { term, t, formatNumber, locale } = useI18n();
  const leadership = isLeadershipRole(data.actor.role);
  const [stage, setStage] = useState<ProjectStage | 'all'>('all');
  const [scope, setScope] = useState<Scope>('all');
  const [search, setSearch] = useState('');
  const registration = useProjectRegistrationFilters(data.projects);
  const projects = registration.filteredProjects;
  const overdue = (project: FieldProject) => needsSalesFollowUp(project) && !!project.next_follow_up_at && Date.parse(project.next_follow_up_at) < now;
  const inOperations = (project: FieldProject) => ['handoff', 'operations'].includes(projectStage(project));
  const summary: { scope: Scope; label: string; count: number; tone: keyof typeof dashboardTones }[] = [
    { scope: 'all', label: 'Total projects', count: projects.length, tone: 'slate' },
    { scope: 'sales', label: 'Awaiting sales action', count: projects.filter(needsSalesFollowUp).length, tone: 'blue' },
    { scope: 'overdue', label: 'Overdue follow-ups', count: projects.filter(overdue).length, tone: 'rose' },
    { scope: 'operations', label: 'Signed / Operations', count: projects.filter(inOperations).length, tone: 'emerald' },
  ];
  const selected = projects.filter(project => {
    const matchesScope = scope === 'all' || (scope === 'sales' && needsSalesFollowUp(project)) || (scope === 'overdue' && overdue(project))
      || (scope === 'operations' && inOperations(project)) || (scope === 'unscheduled' && needsSalesFollowUp(project) && !project.next_follow_up_at);
    return matchesScope && (stage === 'all' || projectStage(project) === stage)
      && matchesProjectSearch(project, search);
  });
  function reset() { setStage('all'); setScope('all'); setSearch(''); registration.reset(); }

  return <section lang={locale} className={`${dashboardArabic.variable} ${styles.dashboard} mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8`}>
    <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-[28px]">{term(leadership ? 'Dashboard' : 'Sales dashboard')}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{term(leadership ? 'Every project, its current stage, and the next action for your team.' : 'See what needs attention and take the next step.')}</p></div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto"><Link href="/mini-crm" className={`${secondary} inline-flex flex-1 items-center justify-center sm:flex-none`}>{term('Open CRM follow-ups')}</Link><Link href="/intake" className={`${button} inline-flex flex-1 items-center justify-center sm:flex-none`}>{term('New client & project')}</Link></div>
    </header>
    <Notice error={error}/>
    {notice && <p role="status" className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900">{term(notice)}</p>}
    <section aria-label={term('Project overview')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {summary.map(item => <button key={item.scope} type="button" aria-pressed={scope === item.scope && stage === 'all'} onClick={() => { setScope(item.scope); setStage('all'); }}
        className={`flex min-h-28 flex-col items-start justify-between gap-3 rounded-lg border border-t-2 bg-white p-4 text-start transition-colors hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${dashboardTones[item.tone].edge} ${scope === item.scope && stage === 'all' ? 'border-slate-400 ring-1 ring-slate-400' : 'border-slate-200'}`}>
        <span className="block text-sm font-medium leading-6 text-slate-600">{term(item.label)}</span>
        <span className={`inline-flex min-w-12 items-center justify-center rounded-md px-2.5 py-0.5 text-[28px] font-semibold leading-9 tabular-nums ${dashboardTones[item.tone].surface}`}>{formatNumber(item.count)}</span>
      </button>)}
    </section>

    {leadership&&<details className={`${styles.coverage} mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white`}>
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700">
        <span>{t('dashboard.outdoorCoverage.title')}</span>
        <svg aria-hidden="true" className={styles.coverageChevron} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 9 6 6 6-6"/></svg>
      </summary>
      <div className={styles.coverageContent}><OutdoorSalesCoverage/></div>
    </details>}

    <div className="mt-4">
      <DashboardProjectFilters collapsible registration={registration} search={search} onSearch={setSearch} filter={stage} onFilter={value => setStage(value as ProjectStage | 'all')} onClear={reset} count={selected.length} total={data.projects.length}>
        <label className="text-sm font-medium text-slate-700">{term('Project priority')}<select value={scope} onChange={event => setScope(event.target.value as Scope)} className={field}>
          <option value="all">{term('All projects in this stage')}</option><option value="sales">{term('Awaiting sales action')}</option><option value="overdue">{term('Overdue follow-ups')}</option><option value="unscheduled">{term('Needs a follow-up date')}</option><option value="operations">{term('Signed / Operations')}</option>
        </select></label>
      </DashboardProjectFilters>
    </div>

    <section aria-label={term('Filter by project stage')} className="mt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold text-slate-950">{term('Project stages')}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{term('Select a stage to see its projects. Colors match the project cards below.')}</p></div><button type="button" onClick={reset} className="min-h-11 px-2 text-sm font-semibold text-blue-700">{term('Show all projects')}</button></div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
        {projectStages.filter(item => item.id !== 'closed' || projects.some(project => projectStage(project) === 'closed')).map(item => {
          const tone = dashboardTones[dashboardStageTone[item.id]];
          return <button key={item.id} type="button" aria-pressed={stage === item.id} onClick={() => { setStage(stage === item.id ? 'all' : item.id); setScope('all'); }}
            className={`flex min-h-14 items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${stage === item.id ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
            <span className="flex items-start gap-2 text-sm font-medium leading-5 text-slate-700"><span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`}/>{term(item.label)}</span>
            <span className="shrink-0 text-lg font-semibold tabular-nums text-slate-900">{formatNumber(projects.filter(project => projectStage(project) === item.id).length)}</span>
          </button>;
        })}
      </div>
    </section>

    <section aria-label={term('Projects')} className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold text-slate-950">{term(stage === 'all' ? 'All projects' : projectStages.find(item => item.id === stage)?.label)} <span className="font-normal text-slate-500">· {formatNumber(selected.length)}</span></h2>{(stage !== 'all' || scope !== 'all' || search || registration.month || registration.creator) && <button type="button" onClick={reset} className="min-h-11 text-sm font-semibold text-blue-700">{term('Clear filters')}</button>}</div>
      {!selected.length ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center"><p className="text-sm text-slate-600">{term('No projects match this view.')}</p><button type="button" onClick={reset} className="mt-3 min-h-11 text-sm font-semibold text-blue-700">{term('Show all projects')}</button></div> : <div className="grid grid-cols-1 gap-3">
        {selected.map(project => <ProjectRow key={project.id} project={project} data={data} leadership={leadership} overdue={overdue(project)} busy={busy} onDelete={onDelete} onProjectSaved={onProjectSaved} onClientNameSaved={onClientNameSaved} onIndoorSalesSaved={onIndoorSalesSaved}/>)}
      </div>}
    </section>
    <details className="mt-6 rounded-lg border border-slate-200 bg-white p-4"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-slate-800">{term('Measurement tasks and follow-up reminders')}</summary><div className="pt-4"><SalesTaskPanel data={{...data, projects}} now={now}/></div></details>
  </section>;
}
