"use client";

import Link from 'next/link';
import { useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { FieldProject, SalesWorkspaceData } from '@/lib/offline/types';
import { needsSalesFollowUp, projectLink, projectStage, projectStages, stageDetails, type ProjectStage } from '@/lib/workflow/stages';
import { SalesTaskPanel } from './SalesTaskPanel';
import { button, field, Notice, secondary } from './ui';

const tones = {
  slate: { surface: 'border-slate-300 bg-slate-100 text-slate-800', dot: 'bg-slate-500', edge: 'border-t-slate-500' },
  blue: { surface: 'border-blue-200 bg-blue-50 text-blue-900', dot: 'bg-blue-600', edge: 'border-t-blue-600' },
  amber: { surface: 'border-amber-200 bg-amber-50 text-amber-950', dot: 'bg-amber-500', edge: 'border-t-amber-500' },
  violet: { surface: 'border-violet-200 bg-violet-50 text-violet-900', dot: 'bg-violet-600', edge: 'border-t-violet-600' },
  teal: { surface: 'border-teal-200 bg-teal-50 text-teal-900', dot: 'bg-teal-600', edge: 'border-t-teal-600' },
  emerald: { surface: 'border-emerald-200 bg-emerald-50 text-emerald-900', dot: 'bg-emerald-600', edge: 'border-t-emerald-600' },
  rose: { surface: 'border-rose-200 bg-rose-50 text-rose-900', dot: 'bg-rose-600', edge: 'border-t-rose-600' },
};
const stageTone: Record<ProjectStage, keyof typeof tones> = {
  site: 'slate', measurements: 'blue', 'quotation-preparation': 'amber', 'quotation-response': 'amber',
  'contract-preparation': 'violet', 'contract-signature': 'violet', handoff: 'teal', operations: 'emerald', closed: 'slate',
};
type Scope = 'all' | 'sales' | 'overdue' | 'operations' | 'unscheduled';

function actionFor(project: FieldProject) {
  const stage = projectStage(project);
  if (stage === 'site') return { href: `/mini-crm#project-${project.id}`, label: 'Follow up on site readiness' };
  if (stage === 'measurements') return { href: projectLink(project), label: 'Review measurements' };
  if (stage === 'quotation-preparation') return { href: projectLink(project), label: 'Prepare the quotation' };
  if (stage === 'quotation-response') return { href: projectLink(project), label: 'Open quotation' };
  if (stage === 'contract-preparation') return { href: projectLink(project), label: 'Prepare the contract' };
  if (stage === 'contract-signature') return { href: projectLink(project), label: 'Open contract' };
  if (stage === 'handoff' || stage === 'operations') return { href: '/operations', label: 'Open Operations' };
  return { href: `/projects/${project.id}/follow-ups`, label: 'Review the project record' };
}

export function LeadershipDashboard({ data, error, now }: { data: SalesWorkspaceData; error: string; now: number }) {
  const { term, formatNumber, formatDateTime } = useI18n();
  const [stage, setStage] = useState<ProjectStage | 'all'>('all');
  const [scope, setScope] = useState<Scope>('all');
  const [search, setSearch] = useState('');
  const overdue = (project: FieldProject) => needsSalesFollowUp(project) && !!project.next_follow_up_at && Date.parse(project.next_follow_up_at) < now;
  const inOperations = (project: FieldProject) => ['handoff', 'operations'].includes(projectStage(project));
  const summary: { scope: Scope; label: string; count: number; tone: keyof typeof tones }[] = [
    { scope: 'all', label: 'Total projects', count: data.projects.length, tone: 'slate' },
    { scope: 'sales', label: 'Awaiting sales action', count: data.projects.filter(needsSalesFollowUp).length, tone: 'blue' },
    { scope: 'overdue', label: 'Overdue follow-ups', count: data.projects.filter(overdue).length, tone: 'rose' },
    { scope: 'operations', label: 'Signed / Operations', count: data.projects.filter(inOperations).length, tone: 'emerald' },
  ];
  const selected = data.projects.filter(project => {
    const matchesScope = scope === 'all' || (scope === 'sales' && needsSalesFollowUp(project)) || (scope === 'overdue' && overdue(project))
      || (scope === 'operations' && inOperations(project)) || (scope === 'unscheduled' && needsSalesFollowUp(project) && !project.next_follow_up_at);
    return matchesScope && (stage === 'all' || projectStage(project) === stage)
      && `${project.project_name} ${project.project_number} ${term(project.project_number)} ${project.phone ?? ''}`.toLowerCase().includes(search.trim().toLowerCase());
  });
  function reset() { setStage('all'); setScope('all'); setSearch(''); }

  return <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
    <header className="mb-7 flex flex-wrap items-start justify-between gap-5">
      <div><h1 className="text-3xl font-semibold tracking-tight text-slate-950">{term('Dashboard')}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">{term('Every project, its current stage, and the next action for your team.')}</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/mini-crm" className={`${secondary} inline-flex items-center`}>{term('Open CRM follow-ups')}</Link><Link href="/intake" className={`${button} inline-flex items-center`}>{term('New client & project')}</Link></div>
    </header>
    <Notice error={error}/>
    <section aria-label={term('Project overview')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {summary.map(item => <button key={item.scope} type="button" aria-pressed={scope === item.scope && stage === 'all'} onClick={() => { setScope(item.scope); setStage('all'); setSearch(''); }}
        className={`rounded-xl border border-t-4 bg-white p-4 text-start transition hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${tones[item.tone].edge} ${scope === item.scope && stage === 'all' ? 'border-slate-400 ring-1 ring-slate-400' : 'border-slate-200'}`}>
        <span className="block text-sm font-medium text-slate-600">{term(item.label)}</span>
        <span className={`mt-3 inline-flex min-w-12 items-center justify-center rounded-lg px-3 py-1 text-3xl font-semibold tabular-nums ${tones[item.tone].surface}`}>{formatNumber(item.count)}</span>
      </button>)}
    </section>

    <section aria-label={term('Filter by project stage')} className="mt-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold text-slate-950">{term('Project stages')}</h2><p className="mt-1 text-xs text-slate-600">{term('Select a stage to see its projects. Colors match the project cards below.')}</p></div><button type="button" onClick={reset} className="min-h-11 px-2 text-sm font-semibold text-blue-700">{term('Show all projects')}</button></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {projectStages.filter(item => item.id !== 'closed' || data.projects.some(project => projectStage(project) === 'closed')).map(item => {
          const tone = tones[stageTone[item.id]];
          return <button key={item.id} type="button" aria-pressed={stage === item.id} onClick={() => { setStage(stage === item.id ? 'all' : item.id); setScope('all'); }}
            className={`flex min-h-24 flex-col justify-between gap-4 rounded-lg border p-4 text-start transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${tone.surface} ${stage === item.id ? 'ring-2 ring-slate-800 ring-offset-2' : 'hover:shadow-sm'}`}>
            <span className="flex items-start gap-2 text-sm font-semibold"><span aria-hidden="true" className={`mt-1 h-2 w-2 shrink-0 rounded-full ${tone.dot}`}/>{term(item.label)}</span>
            <span className="text-2xl font-semibold tabular-nums">{formatNumber(data.projects.filter(project => projectStage(project) === item.id).length)}</span>
          </button>;
        })}
      </div>
    </section>

    <section aria-label={term('Projects')} className="mt-8">
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_240px]">
          <label className="text-sm font-medium text-slate-700">{term('Find a project')}<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={term('Client name, project number or phone')} className={field}/></label>
          <label className="text-sm font-medium text-slate-700">{term('Project priority')}<select value={scope} onChange={event => setScope(event.target.value as Scope)} className={field}>
            <option value="all">{term('All projects in this stage')}</option><option value="sales">{term('Awaiting sales action')}</option><option value="overdue">{term('Overdue follow-ups')}</option><option value="unscheduled">{term('Needs a follow-up date')}</option><option value="operations">{term('Signed / Operations')}</option>
          </select></label>
        </div>
      </div>
      <div className="my-5 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold text-slate-950">{term(stage === 'all' ? 'All projects' : projectStages.find(item => item.id === stage)?.label)} <span className="font-normal text-slate-500">· {formatNumber(selected.length)}</span></h2>{(stage !== 'all' || scope !== 'all' || search) && <button type="button" onClick={reset} className="min-h-11 text-sm font-semibold text-blue-700">{term('Clear filters')}</button>}</div>
      {!selected.length ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center"><p className="text-sm text-slate-600">{term('No projects match this view.')}</p><button type="button" onClick={reset} className="mt-3 min-h-11 text-sm font-semibold text-blue-700">{term('Show all projects')}</button></div> : <div className="grid items-start gap-5 lg:grid-cols-2">
        {selected.map(project => {
          const currentStage = projectStage(project), details = stageDetails(project), tone = tones[stageTone[currentStage]], action = actionFor(project);
          const outdoor = project.assignedOutdoorSales ?? (!project.assigned_outdoor_sales_id && (project.original_creator_role === 'Outdoor Sales' || data.outdoorSales?.some(employee => employee.id === project.created_by)) ? project.registeredBy : null);
          return <article key={project.id} className={`min-w-0 overflow-hidden rounded-xl border border-t-4 border-slate-200 bg-white ${tone.edge}`}>
            <div className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-semibold ${tone.surface}`}><span aria-hidden="true" className={`h-2 w-2 rounded-full ${tone.dot}`}/>{term(details.label)}</span>{project.pending && <span className="text-xs text-slate-500">{term('Saved on device')}</span>}</div>
              <h3 className="mt-4 break-words text-xl font-semibold text-slate-950">{project.project_name}</h3><p className="mt-1 text-xs font-medium tracking-wide text-slate-500">{term(project.project_number)}</p>
              <div className={`mt-4 rounded-lg border px-3 py-3 ${tone.surface}`}><p className="text-xs font-medium">{term('Next step')}</p><p className="mt-1 text-sm font-semibold">{term(details.action)}</p></div>
              <dl className="mt-4 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-xs text-slate-500">{term('Responsible Indoor Sales')}</dt><dd className="mt-1 break-words font-medium text-slate-800">{project.followUpOwner ?? term('Not assigned')}</dd></div><div><dt className="text-xs text-slate-500">{term('Outdoor Sales for measurements')}</dt><dd className="mt-1 break-words font-medium text-slate-800">{outdoor ?? term('Not assigned')}</dd></div></dl>
              {needsSalesFollowUp(project) && <div className={`mt-4 rounded-lg border px-3 py-3 text-sm ${overdue(project) ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-slate-200 bg-slate-50 text-slate-600'}`}><p className="text-xs font-semibold">{term(overdue(project) ? 'Overdue follow-up' : 'Next follow-up')}</p><p className="mt-1">{project.next_follow_up_at ? formatDateTime(project.next_follow_up_at) : term('Follow-up date not set')}</p></div>}
              <details className="mt-3 border-t border-slate-100 pt-1"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-slate-600">{term('Project details')}</summary><dl className="grid gap-3 pb-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">{term('Phone')}</dt><dd className="mt-1">{project.phone ? <a href={`tel:${project.phone}`} className="inline-flex min-h-11 items-center text-blue-700" dir="ltr">{project.phone}</a> : '—'}</dd></div><div><dt className="text-xs text-slate-500">{term('Created by')}</dt><dd className="mt-1">{project.registeredBy === 'Employee' ? term('Employee') : project.registeredBy}</dd></div><div className="sm:col-span-2"><dt className="text-xs text-slate-500">{term('Address')}</dt><dd className="mt-1 break-words">{project.address ?? '—'}</dd></div><div><dt className="text-xs text-slate-500">{term('Last updated')}</dt><dd className="mt-1">{formatDateTime(project.updated_at)}</dd></div>{project.project_notes && <div className="sm:col-span-2"><dt className="text-xs text-slate-500">{term('Latest follow-up note')}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{project.project_notes}</dd></div>}</dl></details>
            </div>
            <footer className="flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4"><Link href={action.href} className={`${button} inline-flex items-center justify-center`}>{term(action.label)}</Link>{currentStage !== 'site' && currentStage !== 'closed' && <Link href={needsSalesFollowUp(project) ? `/mini-crm#project-${project.id}` : `/projects/${project.id}/follow-ups`} className="inline-flex min-h-11 items-center text-sm font-semibold text-blue-700">{term(needsSalesFollowUp(project) ? 'Follow up' : 'Follow-up history')}</Link>}</footer>
          </article>;
        })}
      </div>}
    </section>
    <details className="mt-8 rounded-xl border border-slate-200 bg-white p-5"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-slate-800">{term('Measurement tasks and follow-up reminders')}</summary><div className="pt-4"><SalesTaskPanel data={data} now={now}/></div></details>
  </section>;
}
