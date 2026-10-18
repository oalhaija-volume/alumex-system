"use client";
import { canAccessCRM } from '@/lib/auth/permissions';
import Link from 'next/link';
import { useI18n } from '@/components/i18n/I18nProvider';
import { useFieldState } from '@/components/offline/useFieldState';
import { dueFollowUps } from '@/lib/workflow/salesTasks';
import { useNow } from './ui';

export function SalesReminders(){
 const {term,formatNumber}=useI18n();const state=useFieldState();const now=useNow();
 if(!state||state.actor.role==='Outdoor Sales')return null;
 const due=canAccessCRM(state.actor.role)?dueFollowUps(state.projects,state.actor,now):[];
 if(!due.length)return null;
 return <aside aria-label={term('Your reminders')} className="border-b border-blue-200 bg-blue-50 px-5 py-3 print:hidden"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 text-sm text-blue-950">
  <p role="status">{term('{count} follow-ups are due. Record the outcome and schedule the next contact.',{count:formatNumber(due.length)})}</p>
  <Link href="/mini-crm" className="min-h-11 py-2 font-semibold underline">{term('Open follow-ups')}</Link>
 </div></aside>;
}
