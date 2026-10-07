"use client";
import Link from 'next/link';
import { useI18n } from '@/components/i18n/I18nProvider';
import { useFieldState } from '@/components/offline/useFieldState';
import { dueFollowUps,measurementTasks } from '@/lib/workflow/salesTasks';
import { useNow } from './ui';

export function SalesReminders(){
 const {term,formatNumber}=useI18n();const state=useFieldState();const now=useNow();
 if(!state)return null;
 const due=state.actor.role==='Indoor Sales'?dueFollowUps(state.projects,state.actor,now):[];
 const tasks=state.actor.role==='Outdoor Sales'?measurementTasks(state.projects,state.actor):[];
 if(!due.length&&!tasks.length)return null;
 return <aside aria-label={term('Your reminders')} className="border-b border-blue-200 bg-blue-50 px-5 py-3 print:hidden"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 text-sm text-blue-950">
  <p role="status">{due.length?term('{count} follow-ups are due. Record the outcome and schedule the next contact.',{count:formatNumber(due.length)}):term('{count} measurement tasks are waiting for you.',{count:formatNumber(tasks.length)})}</p>
  <Link href={due.length?'/mini-crm':'/dashboard#measurement-tasks'} className="min-h-11 py-2 font-semibold underline">{term(due.length?'Open follow-ups':'View measurement tasks')}</Link>
 </div></aside>;
}
