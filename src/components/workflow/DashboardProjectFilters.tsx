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
  children?: ReactNode;
};

export function DashboardProjectFilters({ search, onSearch, filter, onFilter, onClear, count, total, filterLabel = 'Project stage', options = projectStages, contactSearch = true, children }: Props) {
  const { term, formatNumber } = useI18n();
  return <section aria-label={term('Project filters')} className="mb-7 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
    <div className={`grid gap-4 ${children ? 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]' : 'sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'}`}>
      <label className="min-w-0 text-sm font-medium text-slate-700">{term('Find a project')}
        <input type="search" value={search} onChange={event => onSearch(event.target.value)} placeholder={term(contactSearch ? 'Name, project number, phone or address' : 'Project name or number')} className={field} />
      </label>
      <label className="min-w-0 text-sm font-medium text-slate-700">{term(filterLabel)}
        <select aria-label={term(filterLabel)} value={filter} onChange={event => onFilter(event.target.value)} className={field}>
          <option value="all">{term('All')}</option>
          {options.map(option => <option key={option.id} value={option.id}>{term(option.label)}</option>)}
        </select>
      </label>
      {children}
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
      <p role="status" aria-live="polite" className="text-xs text-slate-500">{term('Showing {count} of {total} projects', { count: formatNumber(count), total: formatNumber(total) })}</p>
      <button type="button" onClick={onClear} className="min-h-11 px-2 text-sm font-semibold text-blue-700 hover:underline">{term('Clear filters')}</button>
    </div>
  </section>;
}
