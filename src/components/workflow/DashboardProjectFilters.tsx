'use client';
import type { ReactNode } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { projectStages } from '@/lib/workflow/stages';
import { field } from './ui';

type Props = {
  search: string;
  onSearch: (value: string) => void;
  filter: string;
  onFilter: (value: string) => void;
  onClear: () => void;
  count: number;
  total: number;
  filterLabel?: string;
  options?: readonly { id: string; label: string }[];
  contactSearch?: boolean;
  collapsible?: boolean;
  children?: ReactNode;
  registration?: {
    month: string; setMonth: (value: string) => void; months: string[];
    creator: string; setCreator: (value: string) => void; creators: { id: string; name: string }[];
  };
};

export function DashboardProjectFilters({ search, onSearch, filter, onFilter, onClear, count, total, filterLabel = 'Project stage', options = projectStages, contactSearch = true, collapsible = false, children, registration }: Props) {
  const { term, formatNumber, locale } = useI18n();
  const monthLabel = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-IQ' : 'en-GB', { month: 'long', year: 'numeric', calendar: 'gregory', numberingSystem: 'latn', timeZone: 'Asia/Baghdad' });
  const searchControl = <label className="block min-w-0 text-sm font-medium text-slate-700">{term('Find a project')}
    <input type="search" value={search} onChange={event => onSearch(event.target.value)} placeholder={term(contactSearch ? 'Name, project number, phone or address' : 'Project name or number')} className={field} />
  </label>;
  const stageControl = <label className="min-w-0 text-sm font-medium text-slate-700">{term(filterLabel)}
    <select aria-label={term(filterLabel)} value={filter} onChange={event => onFilter(event.target.value)} className={field}>
      <option value="all">{term('All')}</option>
      {options.map(option => <option key={option.id} value={option.id}>{term(option.label)}</option>)}
    </select>
  </label>;
  const registrationControls = registration && <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="min-w-0 text-sm font-medium text-slate-700">{term('Created month')}
        <select value={registration.month} onChange={event => registration.setMonth(event.target.value)} className={field}>
          <option value="">{term('All months')}</option>
          {registration.months.map(month => <option key={month} value={month}>{monthLabel.format(new Date(`${month}-15T12:00:00Z`))}</option>)}
        </select>
      </label>
      <label className="min-w-0 text-sm font-medium text-slate-700">{term('Created by')}
        <select value={registration.creator} onChange={event => registration.setCreator(event.target.value)} className={field}>
          <option value="">{term('All creators')}</option>
          {registration.creators.map(creator => <option key={creator.id} value={creator.id}>{creator.name === 'Employee' ? term('Employee') : creator.name}</option>)}
        </select>
      </label>
    </div>;

  if (collapsible) return <section aria-label={term('Project filters')} className="mb-5 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
    {searchControl}
    <details className="group mt-4 rounded-md border border-slate-200">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-4 shrink-0"><path strokeLinecap="round" d="M4 6h16M7 12h10M10 18h4" /></svg>
          {term('Filters')}
        </span>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-4 shrink-0 group-open:rotate-180"><path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" /></svg>
      </summary>
      <div className="border-t border-slate-200 p-3 sm:p-4">
        <div className={`grid gap-4 ${children ? 'sm:grid-cols-2' : ''}`}>
          {stageControl}
          {children}
        </div>
        {registrationControls}
      </div>
    </details>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <p role="status" aria-live="polite" className="text-sm text-slate-600">{term('Showing {count} of {total} projects', { count: formatNumber(count), total: formatNumber(total) })}</p>
      <button type="button" onClick={onClear} className="min-h-11 rounded-md px-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">{term('Clear filters')}</button>
    </div>
  </section>;

  return <section aria-label={term('Project filters')} className="mb-7 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
    <div className={`grid gap-4 ${children ? 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]' : 'sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'}`}>
      {searchControl}
      {stageControl}
      {children}
    </div>
    {registrationControls}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p role="status" aria-live="polite" className="text-xs text-slate-500">{term('Showing {count} of {total} projects', { count: formatNumber(count), total: formatNumber(total) })}</p>
      <button type="button" onClick={onClear} className="min-h-11 px-2 text-sm font-semibold text-blue-700 hover:underline">{term('Clear filters')}</button>
    </div>
  </section>;
}
