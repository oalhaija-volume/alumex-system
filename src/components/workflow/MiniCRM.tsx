"use client";
import { ClientCancellation } from '@/components/measurements/ClientCancellation';
import { ReactivateProject } from './ReactivateProject';
import { canReactivateProject } from '@/lib/workflow/reactivation';
import { canCancelProject } from '@/lib/measurements/measurementDelay';
import { MeasurementDelayNotice } from '@/components/measurements/MeasurementDelayNotice';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import type { FieldProject, SalesWorkspaceData } from '@/lib/offline/types';
import { followUpTypeLabel } from '@/lib/workflow/followUps';
import { needsSalesFollowUp, projectLink, projectStage, projectStages, stageDetails } from '@/lib/workflow/stages';
import { ProjectFollowUps } from './ProjectFollowUps';
import { FollowUpFields } from './FollowUpFields';
import { button, Notice } from './ui';

type QueueFilter = 'all' | 'overdue' | 'today' | 'unscheduled';
type Props = {
  data: SalesWorkspaceData | null;
  loading: boolean;
  error: string;
  notice: string;
  busy: string;
  now: number;
  canDelete: boolean;
  onUpdate: (project: FieldProject, action: string, form?: HTMLFormElement) => Promise<void>;
  onDelete: (project: FieldProject) => Promise<void>;
};

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600';
const control = `min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 ${focus}`;
const projectColumns = 'lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_12rem] lg:gap-6';
const mobileLabel = 'mb-2 text-xs font-semibold text-slate-500 lg:hidden';
const baghdadDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baghdad', year: 'numeric', month: '2-digit', day: '2-digit' });

function dueTime(project: FieldProject) {
  const time = project.next_follow_up_at ? Date.parse(project.next_follow_up_at) : NaN;
  return Number.isFinite(time) ? time : null;
}

function matchesQueue(project: FieldProject, filter: QueueFilter, now: number) {
  const due = dueTime(project);
  if (filter === 'all') return true;
  if (filter === 'unscheduled') return due === null;
  if (due === null || !now) return false;
  return filter === 'overdue' ? due < now : baghdadDay.format(due) === baghdadDay.format(now);
}

function Icon({ kind, className = '' }: { kind: 'search' | 'clock' | 'calendar' | 'queue' | 'plus' | 'chevron'; className?: string }) {
  const paths = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
    clock: <><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></>,
    calendar: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4m8-4v4M4 10h16m-11 4h2m2 0h2" /></>,
    queue: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 9h8m-8 6h8" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    chevron: <path d="m8 10 4 4 4-4" />,
  };
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>{paths[kind]}</svg>;
}

export function MiniCRM({ data, loading, error, notice, busy, now, canDelete, onUpdate, onDelete }: Props) {
  const { term, formatNumber } = useI18n();
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('all');
  const [queue, setQueue] = useState<QueueFilter>('all');
  useEffect(() => {
    // Notification links may arrive before the workspace request finishes, or
    // point at a project hidden by a previous search on the same CRM page.
    let observer: MutationObserver | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    function revealProject(hash: string) {
      if (!/^#project-[0-9a-f-]{36}$/i.test(hash)) return;
      observer?.disconnect();clearTimeout(timeout);
      setQuery('');setStage('all');setQueue('all');
      const id = hash.slice(1);
      const focusProject = () => {
        const target = document.getElementById(id);
        if (!target) return false;
        target.tabIndex = -1;
        target.scrollIntoView({ block: 'start' });
        target.focus({ preventScroll: true });
        observer?.disconnect();return true;
      };
      if (focusProject()) return;
      observer = new MutationObserver(() => focusProject());
      observer.observe(document.body, { childList: true, subtree: true });
      timeout = setTimeout(() => observer?.disconnect(), 15000);
    }
    const hashChanged = () => revealProject(window.location.hash);
    const linkClicked = (event: MouseEvent) => {
      const href = (event.target as HTMLElement).closest('a[href]')?.getAttribute('href');
      if (!href) return;
      const target = new URL(href, window.location.href);
      if (target.origin === location.origin && target.pathname === location.pathname) revealProject(target.hash);
    };
    const initial = setTimeout(hashChanged, 0);
    window.addEventListener('hashchange', hashChanged);
    window.addEventListener('click', linkClicked);
    return () => { clearTimeout(initial);clearTimeout(timeout);observer?.disconnect();window.removeEventListener('hashchange', hashChanged);window.removeEventListener('click', linkClicked); };
  }, []);
  const active = (data?.projects ?? []).filter(needsSalesFollowUp);
  const search = query.trim().toLocaleLowerCase();
  const projects = (stage === 'client-cancelled' ? (data?.projects ?? []).filter(p=>projectStage(p)==='client-cancelled') : active).filter(project =>
    (stage === 'all' || projectStage(project) === stage) && (stage === 'client-cancelled' || matchesQueue(project, queue, now)) &&
    (!search || [project.project_name, project.project_number, project.address, project.phone, project.followUpOwner, project.assignedOutdoorSales].some(value => value?.toLocaleLowerCase().includes(search)))
  ).sort((a, b) => (dueTime(a) ?? Infinity) - (dueTime(b) ?? Infinity) || a.project_number.localeCompare(b.project_number));
  const filters: { id: QueueFilter; label: string; hint: string; icon: 'queue' | 'clock' | 'calendar'; tone: string }[] = [
    { id: 'all', label: 'Active follow-ups', hint: 'Across all sales stages', icon: 'queue', tone: 'text-blue-700 bg-blue-50' },
    { id: 'overdue', label: 'Overdue', hint: 'Past the scheduled time', icon: 'clock', tone: 'text-amber-800 bg-amber-50' },
    { id: 'today', label: 'Due today', hint: 'Scheduled for today', icon: 'calendar', tone: 'text-blue-700 bg-blue-50' },
    { id: 'unscheduled', label: 'Unscheduled', hint: 'Set the next contact', icon: 'calendar', tone: 'text-slate-600 bg-slate-100' },
  ];
  const filtered = query !== '' || stage !== 'all' || queue !== 'all';

  return <section className="mx-auto max-w-7xl px-4 py-7 sm:px-8 sm:py-10">
    <header className="mb-7 flex flex-wrap items-start justify-between gap-5">
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wider text-blue-700">{term('SALES WORKSPACE')}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">{term('Mini CRM')}</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">{term('Keep every conversation moving, from first contact to signature.')}</p>
      </div>
      <Link href="/intake" className={`${button} ${focus} inline-flex items-center gap-2`}><Icon kind="plus" />{term('New client & project')}</Link>
    </header>

    <Notice error={error} />
    {notice && <p role="status" className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{term(notice)}</p>}

    <div aria-label={term('Follow-up overview')} className="mb-7 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {filters.map(filter => <button key={filter.id} type="button" aria-pressed={queue === filter.id} disabled={loading} onClick={() => { setQueue(filter.id); setStage('all'); setQuery(''); }}
        className={`${focus} rounded-xl border p-4 text-start transition-colors sm:p-5 ${queue === filter.id ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
        <span className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-slate-600">{term(filter.label)}</span><span className={`hidden rounded-lg p-2 sm:block ${filter.tone}`}><Icon kind={filter.icon} /></span></span>
        <span className={`mt-3 block text-3xl font-semibold tabular-nums tracking-tight ${filter.id === 'overdue' ? 'text-amber-800' : 'text-slate-950'}`}>{loading ? '—' : formatNumber(active.filter(project => matchesQueue(project, filter.id, now)).length)}</span>
        <span className="mt-2 block text-xs leading-5 text-slate-500">{term(filter.hint)}</span>
      </button>)}
    </div>

    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">{term('Follow-up queue')}<span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-600">{loading ? '—' : formatNumber(projects.length)}</span></h2>
          <span className="text-xs text-slate-500">{term('Earliest follow-up first')}</span>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1"><span className="sr-only">{term('Search follow-ups')}</span><span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-slate-400"><Icon kind="search" /></span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={term('Search name, project or phone…')} className={`${control} ps-10`} /></label>
          <label className="sm:w-64"><span className="sr-only">{term('Project stage')}</span><select aria-label={term('Project stage')} value={stage} onChange={event => setStage(event.target.value)} className={control}><option value="all">{term('All active sales stages')}</option>{projectStages.filter(item => !['handoff', 'operations', 'closed'].includes(item.id)).map(item => <option key={item.id} value={item.id}>{term(item.label)}</option>)}</select></label>
        </div>
        {filtered && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600"><p role="status">{term('Showing {count} of {total} active follow-ups', { count: formatNumber(projects.length), total: formatNumber(active.length) })}{queue !== 'all' && <> · {term(filters.find(filter => filter.id === queue)!.label)}</>}</p><button type="button" onClick={() => { setQuery(''); setStage('all'); setQueue('all'); }} className={`${focus} min-h-11 px-2 font-semibold text-blue-700`}>{term('Clear filters')}</button></div>}
      </div>

      {loading ? <div role="status" className="space-y-5 p-6"><p className="text-sm text-slate-500">{term('Loading projects…')}</p>{[0, 1, 2].map(index => <div key={index} aria-hidden="true" className="h-20 rounded-lg bg-slate-100 motion-safe:animate-pulse" />)}</div> : error && !data ? <div className="px-6 py-10 text-sm text-slate-600">{term('Follow-ups could not be loaded. Refresh the page to try again.')}</div> : !projects.length ? <div className="flex flex-col items-center px-6 py-14 text-center"><span className="mb-4 rounded-xl bg-slate-100 p-3 text-slate-500"><Icon kind="queue" /></span><h3 className="font-semibold text-slate-900">{term(filtered ? 'No matching follow-ups' : 'No active follow-ups')}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{term(filtered ? 'Try another search or clear your filters to see all active projects.' : 'New projects appear here until the contract is signed.')}</p></div> : <>
        <div className="flex flex-col gap-6">{projects.map(project => <CRMProject key={project.id} project={project} data={data} now={now} busy={busy} canDelete={canDelete} onUpdate={onUpdate} onDelete={onDelete} />)}</div>
      </>}
    </div>
    <p className="mt-4 text-xs leading-5 text-slate-500">{term('Signed projects move out of sales follow-up and into Operations.')}</p>
  </section>;
}

function CRMProject({ project, data, now, busy, canDelete, onUpdate, onDelete }: Pick<Props, 'data' | 'now' | 'busy' | 'canDelete' | 'onUpdate' | 'onDelete'> & { project: FieldProject }) {
  const { term, formatDateTime } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const due = dueTime(project);
  const overdue = due !== null && now > due;
  const today = due !== null && now > 0 && baghdadDay.format(due) === baghdadDay.format(now);
  const stage = stageDetails(project);
  const cancelled = stage.id === 'client-cancelled';
  const canRequest = ['ready_for_quotation','quotation_in_progress','quotation_approved','contract_generated'].includes(project.sales_status) && project.structure_readiness==='ready';
  const assignmentLabel = canRequest?'Add more openings':'Assign measurements';
  const canAssign = project.sales_status === 'new_lead' && ['site', 'measurements', 'measurement-delayed'].includes(stage.id);
  const indoorCreator = (project.original_creator_role === 'Indoor Sales' || project.original_creator_role === 'Sales Manager') ? data?.indoorSales?.find(employee => employee.id === project.created_by) : undefined;
  const measurementEmployees = [...(!canRequest && indoorCreator ? [indoorCreator] : []), ...(data?.outdoorSales ?? [])];
  const stageTone = cancelled ? 'bg-red-50 text-red-900' : stage.id === 'measurement-delayed' ? 'bg-amber-50 text-amber-900' : ['contract-signature', 'contract-preparation'].includes(stage.id) ? 'bg-indigo-50 text-indigo-800' : stage.id === 'site' ? 'bg-slate-100 text-slate-700' : 'bg-blue-50 text-blue-800';
  return <article id={`project-${project.id}`} aria-labelledby={`project-name-${project.id}`} className="scroll-mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm target:ring-2 target:ring-blue-500">
    <div aria-hidden="true" className={`hidden ${projectColumns} border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold text-slate-600 lg:grid`}>
      <span>{term('Client / project')}</span><span>{term('Project stage')}</span><span>{term('Next follow-up')}</span><span>{term('Action')}</span>
    </div>
    <div className={`grid items-start gap-5 p-4 sm:p-5 ${projectColumns}`}>
      <div className="min-w-0">
        <p className={mobileLabel}>{term('Client / project')}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-medium text-slate-500">{term(project.project_number)}</span>{project.pending && <span className="rounded bg-amber-50 px-2 py-0.5 text-amber-800">{term('Saved on device')}</span>}{project.assignedToYou && <span className="font-medium text-blue-700">{term('Assigned to you')}</span>}</div>
        <h3 id={`project-name-${project.id}`} dir="auto" className="mt-1.5 break-words text-lg font-semibold leading-7 text-slate-950">{project.project_name}</h3>
        {project.address && <p dir="auto" className="mt-1 break-words text-xs leading-5 text-slate-500">{project.address}</p>}
   {project.readiness_note&&<p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-700"><span className="font-semibold">{term('Reason not ready for measurement')}: </span><span dir="auto">{project.readiness_note}</span></p>}
        {project.phone && <a dir="ltr" href={`tel:${project.phone}`} className={`${focus} mt-1 inline-flex min-h-8 items-center text-xs font-medium text-blue-700 hover:underline`}>{project.phone}</a>}
      </div>
      <div className="min-w-0 border-t border-slate-100 pt-4 lg:border-0 lg:pt-0"><p className={mobileLabel}>{term('Project stage')}</p><span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-medium leading-5 ${stageTone}`}>{term(stage.label)}</span><p className="mt-2 text-xs leading-5 text-slate-500">{term(stage.action)}</p><MeasurementDelayNotice project={project}/>{(canAssign||canRequest)&&<p className="mt-2 text-xs font-medium text-slate-700">{term('Measurements by')}: {project.assignedOutdoorSales??term('Not assigned')}</p>}</div>
      <div className="min-w-0 border-t border-slate-100 pt-4 lg:border-0 lg:pt-0">
        <p className={mobileLabel}>{term('Next follow-up')}</p>
        <p className={`flex items-center gap-1.5 text-xs font-semibold ${overdue ? 'text-amber-800' : today ? 'text-blue-700' : 'text-slate-500'}`}><Icon kind="clock" className="h-3.5 w-3.5" />{term(overdue ? 'Overdue' : today ? 'Due today' : due === null ? 'Unscheduled' : 'Upcoming')}</p>
        {due !== null && <time dateTime={project.next_follow_up_at!} className="mt-1.5 block text-sm font-medium leading-5 text-slate-800">{formatDateTime(due)}</time>}
        <p className="mt-1.5 break-words text-xs leading-5 text-slate-500">{due !== null && <>{term(followUpTypeLabel(project.follow_up_type))} · </>}{project.followUpOwner ?? term('Not assigned')}</p>
      </div>
      <div className="min-w-0">
        <p className={mobileLabel}>{term('Action')}</p>
        <div className="flex flex-col gap-2">
          {(canAssign||canRequest)&&<button type="button" aria-expanded={expanded} aria-controls={`follow-up-editor-${project.id}`} onClick={()=>{setExpanded(true);setHasOpened(true);}} className={`${focus} min-h-11 rounded-lg bg-blue-600 px-3 py-2 text-sm! font-semibold! text-white transition-colors hover:bg-blue-700`}>{term(canRequest?'Add more openings':project.measurement_delayed?'Reassign measurements':'Assign measurements')}</button>}
          {!cancelled && <button type="button" aria-expanded={expanded} aria-controls={`follow-up-editor-${project.id}`} onClick={() => { setExpanded(!expanded); setHasOpened(true); }} className={`${focus} flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm! font-semibold! whitespace-nowrap transition-colors ${expanded ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'}`}><span>{term(expanded ? 'Close' : 'Follow up')}</span><Icon kind="chevron" className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} /></button>}
          {data && canCancelProject(project,data.actor) && <ClientCancellation busy={!!busy} onSubmit={form=>void onUpdate(project,'cancel-project',form)}/>}
          {cancelled && <Link href={`/projects#project-${project.id}`} className="min-h-11 py-2 text-sm font-semibold text-blue-700">{term('Review the project record')}</Link>}
          {canReactivateProject(project,data?.actor.role)&&<ReactivateProject busy={!!busy||!!project.pending} onSubmit={form=>void onUpdate(project,'reactivate-project',form)}/>}
        </div>
      </div>
    </div>

    <div id={`follow-up-editor-${project.id}`} hidden={cancelled||!expanded} className="border-t border-slate-200 bg-slate-50 p-4 sm:p-6">
      {hasOpened && !cancelled && <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_15rem]">
        {(canAssign||canRequest)&&<form aria-label={term(assignmentLabel)} className="rounded-lg border border-blue-200 bg-white p-4 xl:col-span-2" onSubmit={event=>{event.preventDefault();void onUpdate(project,canRequest?'request-openings':stage.id==='site'?'ready':'assign-measurements',event.currentTarget);}}>
          <fieldset disabled={!!busy} className="min-w-0">
            <legend className="font-semibold text-slate-900">{term(assignmentLabel)}</legend>
            <p className="mt-2 text-sm leading-6 text-slate-600">{term(canRequest?'Assign a return visit to measure additional openings. Existing measurements and quotations are kept.':stage.id==='site'?'When the site is ready, choose who will collect the initial measurements.':'Choose who will record the initial measurements.')}</p>
            <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-end">
              <label className="w-full text-sm sm:max-w-sm">{term('Measurements by')}
                <select key={project.assigned_outdoor_sales_id??'unassigned'} name="assignedOutdoorSalesId" required defaultValue={measurementEmployees.some(employee=>employee.id===project.assigned_outdoor_sales_id)?project.assigned_outdoor_sales_id!:data?.outdoorSales?.length===1?data.outdoorSales[0].id:''} className={`${control} mt-2`}>
                  <option value="">{term('Choose who will record the initial measurements.')}</option>
                  {measurementEmployees.map(employee=><option key={employee.id} value={employee.id}>{employee.name}</option>)}
                </select>
              </label>
              <button type="submit" disabled={!measurementEmployees.length} className={`${button} ${focus}`}>{term(busy===project.id?'Please wait…':canRequest?'Send additional-openings task':stage.id==='site'?'Assign & mark site ready':'Save measurement assignment')}</button>
            </div>
            {!measurementEmployees.length&&<p className="mt-3 text-sm text-amber-800">{term('No active Outdoor Sales employees available. Add one in Employees and reconnect to refresh this list.')}</p>}
            <p className="mt-3 text-xs leading-5 text-slate-500">{term('The assigned employee will see the project in their mobile workspace to collect measurements.')}</p>
          </fieldset>
        </form>}
        <form onSubmit={event => { event.preventDefault(); void onUpdate(project, 'follow-up', event.currentTarget); }}>
          <h4 className="mb-4 text-sm font-semibold text-slate-900">{term('Record the outcome & next step')}</h4>
          <fieldset disabled={!!busy} className="min-w-0"><legend className="sr-only">{term('Record follow-up')}</legend><FollowUpFields project={project} actor={data?.actor} indoorSales={data?.indoorSales ?? []} />
            <div className="mt-5 flex flex-wrap items-center gap-3"><button type="submit" className={`${button} ${focus}`}>{term(busy === project.id ? 'Please wait…' : 'Save follow-up')}</button></div>
          </fieldset>
        </form>
        <aside aria-label={term('Project details')} className="border-t border-slate-200 pt-5 xl:border-s xl:border-t-0 xl:ps-6 xl:pt-0">
          <h4 className="text-sm font-semibold text-slate-900">{term('Project details')}</h4>
          <dl className="mt-4 grid gap-4 text-xs sm:grid-cols-2 xl:grid-cols-1"><div><dt className="text-slate-500">{term('Measurements by')}</dt><dd className="mt-1 font-medium text-slate-800">{project.assignedOutdoorSales ?? term('Not assigned')}</dd></div><div><dt className="text-slate-500">{term('Created by')}</dt><dd className="mt-1 font-medium text-slate-800">{project.registeredBy === 'Employee' ? term('Employee') : project.registeredBy}{project.original_creator_role && <> · {term(project.original_creator_role)}</>}<time dateTime={project.created_at} dir="ltr" className="mt-1 block font-normal text-slate-500 w-fit max-w-full">{formatDateTime(project.created_at)}</time></dd></div></dl>
          {project.follow_up_type === 'other' && project.follow_up_detail && <p className="mt-4 break-words text-xs text-slate-600">{project.follow_up_detail}</p>}
          <div className="mt-4 flex flex-col items-start gap-2">
            {canAssign ? <p className="text-sm leading-6 text-slate-600">{term('The assigned employee will collect the initial measurements.')}</p> : <Link href={projectLink(project)} className={`${focus} inline-flex min-h-11 items-center text-sm font-semibold text-blue-700`}>{term('Open project →')}</Link>}
            <Link href={`/projects/${project.id}/follow-ups`} className={`${focus} inline-flex min-h-11 items-center text-sm font-medium text-blue-700`}>{term('View follow-up history →')}</Link>
          </div>
          {canDelete && <div className="mt-4 border-t border-slate-200 pt-2"><button type="button" disabled={!!busy || project.pending} onClick={() => void onDelete(project)} className={`${focus} min-h-11 text-xs font-medium text-red-700 hover:underline disabled:opacity-50`}>{term('Delete project')}</button>{project.pending && <p className="text-xs leading-5 text-slate-500">{term('Sync saved changes before deleting.')}</p>}</div>}
        </aside>
      </div>}
    </div>
    <ProjectFollowUps projectId={project.id}/>
  </article>;
}
