"use client";
import Link from 'next/link';
import { useI18n } from '@/components/i18n/I18nProvider';
import { ProjectRecord } from './ProjectRecord';
import { FollowUpHistoryTable } from './ProjectFollowUps';
import { useFollowUpHistory } from './useFollowUpHistory';
import { card, Notice, Workspace } from './ui';

export function FollowUpWorkspace({ projectId }: { projectId: string }) {
  const { term, formatDateTime } = useI18n();
  const { data, error, loading, cached } = useFollowUpHistory(projectId);
  return <Workspace title={term('Project follow-ups')} description={term('The history of follow-up notes and site readiness updates for this project.')}>
    <div className="mb-6 flex flex-wrap gap-5 text-sm font-semibold text-blue-600"><Link href="/mini-crm">{term('← Follow-ups')}</Link><Link href="/projects">{term('All projects')}</Link></div>
    <ProjectRecord projectId={projectId}/><Notice error={error}/>
    {loading ? <p>{term('Loading follow-ups…')}</p> : data && <>
      <section className={`${card} mb-6`}><p className="text-xs font-semibold text-blue-600">{term(data.project.project_number)}</p><h2 className="mt-2 text-xl font-semibold">{data.project.project_name}</h2><p className="mt-3 text-sm text-slate-600">{data.project.next_follow_up_at ? term('Next follow-up: {date}', { date: formatDateTime(data.project.next_follow_up_at) }) : term('No follow-up scheduled yet.')}</p></section>
      {cached && <p role="status" className="mb-5 text-sm text-amber-800">{term('Showing history saved on this device and pending notes. Connect to see the latest updates.')}</p>}
      <FollowUpHistoryTable entries={data.entries}/>
    </>}
  </Workspace>;
}
