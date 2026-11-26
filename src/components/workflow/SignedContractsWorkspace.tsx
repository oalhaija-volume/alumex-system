'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { effectiveProjectBranch, hasGlobalProjectAccess } from '@/lib/auth/projectBranchAccess';
import { applyClientNameUpdate, canRenameClient, type ClientNameUpdate } from '@/lib/clients/name';
import type { SignedContractRecord, SignedContractsData } from '@/lib/contracts/signedContracts';
import { updateSavedClientName } from '@/lib/offline/client';
import { ClientNameEditor } from './ClientNameEditor';
import { card, field, Notice, secondary, useResource, Workspace } from './ui';

const pageSize = 25;

export function SignedContractsWorkspace() {
  const { term, formatDateTime, formatNumber, formatCurrency } = useI18n();
  const { data, setData, error, setError, loading, reload } = useResource<SignedContractsData>('/api/signed-contracts');
  const [branch, setBranch] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  // Each employee starts in their own branch. Leadership can select any branch.
  const globalAccess = hasGlobalProjectAccess(data?.actor.role);
  const selectedBranch = branch || (globalAccess ? '' : data?.actor.branch) || '';
  const query = search.trim().toLocaleLowerCase();
  const records = (data?.records ?? []).filter(record =>
    (!selectedBranch || effectiveProjectBranch(record.project) === selectedBranch)
    && (!query || [record.contractNumber, record.project.project_number, record.project.project_name,
      record.project.client_name, record.project.phone, record.signer]
      .some(value => value?.toLocaleLowerCase().includes(query))),
  );
  const pageCount = Math.max(1, Math.ceil(records.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRecords = records.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function refresh() {
    setRefreshing(true);
    try { await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load signed contracts.'); }
    finally { setRefreshing(false); }
  }

  async function renamed(record: SignedContractRecord, update: ClientNameUpdate) {
    if (!data) return;
    setData(current => current && current.actor.id === data.actor.id ? { ...current, records: current.records.map(row =>
      ({ ...row, project: applyClientNameUpdate(row.project, update) }),
    ) } : current);
    await updateSavedClientName(data.actor.id, record.project.id, record.project.client_id, update.client.client_name, update.projects)
      .catch(() => { /* The next device refresh will update its saved client record. */ });
  }

  const methods = { digital: 'Digital signature', upload: 'Uploaded signed copy', hard_copy: 'Signed hard copy' } as const;
  return <Workspace title="Signed contracts" description="Signed contract records for your branch, including projects transferred to Operations.">
    <Notice error={error} />
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-2xl text-sm leading-6 text-slate-600">{term('Client name corrections update the client record, matching project titles and current documents. Original signed contracts are retained; revised copies need new approval and signature.')}</p>
      <button type="button" className={secondary} disabled={loading || refreshing} onClick={() => void refresh()}>
        {term(refreshing ? 'Refreshing records…' : 'Refresh records')}
      </button>
    </div>
    {loading ? <p role="status">{term('Loading signed contracts…')}</p> : data && <>
      <div className={`${card} mb-5`}>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <label className="min-w-0 text-sm font-medium text-slate-700">{term('Branch')}
            <select className={field} value={selectedBranch} disabled={data.branches.length <= 1} onChange={event => { setBranch(event.target.value); setPage(1); }}>
              {globalAccess && <option value="">{term('All branches')}</option>}
              {data.branches.map(value => <option key={value} value={value}>{term(value)}</option>)}
            </select>
          </label>
          <label className="min-w-0 text-sm font-medium text-slate-700">{term('Search signed contracts')}
            <input type="search" value={search} dir="auto" className={field}
              placeholder={term('Client, project, contract number or phone')}
              onChange={event => { setSearch(event.target.value); setPage(1); }} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="text-sm text-slate-600">{term('Signed contract records: {count}', { count: formatNumber(records.length) })}</p>
          {(search || branch) && <button type="button" className="min-h-11 rounded-md px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
            onClick={() => { setSearch(''); setBranch(''); setPage(1); }}>{term('Clear filters')}</button>}
        </div>
      </div>
      {!records.length ? <div className={card}><p className="text-sm leading-6 text-slate-600">{term(search
        ? 'No signed contracts match your search. Try a client name, project number or contract number.'
        : 'No signed contracts in this branch yet. Contracts appear here once signing is recorded.')}</p></div>
        : <div className="space-y-4">{visibleRecords.map(record => <article key={record.project.id} id={`signed-contract-${record.project.id}`} className={card}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-blue-700">{term('Contract number')}: <bdi>{record.contractNumber}</bdi></p>
              <h2 className="mt-2 break-words text-lg font-semibold" dir="auto">{record.project.project_name}</h2>
              <p className="mt-1 break-words text-sm text-slate-600"><bdi>{record.project.project_number}</bdi></p>
            </div>
            <span className="rounded-md bg-green-50 px-3 py-1 text-xs font-semibold text-green-800">{term('Signed contract')}</span>
          </div>
          {canRenameClient(record.project, data.actor)
            ? <ClientNameEditor project={record.project} actor={data.actor} onSaved={update => renamed(record, update)} />
            : <p className="mt-3 break-words text-sm text-slate-600">{term('Client name')}: <bdi className="font-medium text-slate-900">{record.project.client_name || term('Not added')}</bdi></p>}
          <dl className="mt-4 grid grid-cols-1 gap-x-5 gap-y-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2 xl:grid-cols-3">
            <div><dt className="text-slate-500">{term('Branch')}</dt><dd className="mt-1 font-medium">{term(effectiveProjectBranch(record.project))}</dd></div>
            <div><dt className="text-slate-500">{term('Signed on')}</dt><dd className="mt-1"><time dateTime={record.signedAt} dir="ltr">{formatDateTime(record.signedAt)}</time></dd></div>
            <div><dt className="text-slate-500">{term('Contract value')}</dt><dd className="mt-1 font-medium">{record.total === null ? term('Not added') : record.currency === 'IQD' ? formatCurrency(record.total) : <bdi>{formatNumber(record.total)} {record.currency}</bdi>}</dd></div>
            <div><dt className="text-slate-500">{term('Signed by')}</dt><dd className="mt-1 break-words" dir="auto">{record.signer || term('Not added')}</dd></div>
            <div><dt className="text-slate-500">{term('Signing method')}</dt><dd className="mt-1">{record.method ? term(methods[record.method]) : term('Not added')}</dd></div>
            {record.project.phone && <div><dt className="text-slate-500">{term('Phone')}</dt><dd className="mt-1"><a href={`tel:${record.project.phone}`} dir="ltr" className="inline-block break-all font-medium text-blue-700">{record.project.phone}</a></dd></div>}
          </dl>
          <Link href={`/contract/${record.project.id}`} className="mt-4 inline-block min-h-11 rounded-md py-2 text-sm font-semibold text-blue-700 hover:underline">{term('View signed contract →')}</Link>
        </article>)}</div>}
      {pageCount > 1 && <nav aria-label={term('Signed contracts pages')} className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button type="button" className={secondary} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>{term('Previous')}</button>
        <p className="text-sm text-slate-600">{term('Page {page} of {pages}', { page: formatNumber(currentPage), pages: formatNumber(pageCount) })}</p>
        <button type="button" className={secondary} disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>{term('Next')}</button>
      </nav>}
    </>}
  </Workspace>;
}
