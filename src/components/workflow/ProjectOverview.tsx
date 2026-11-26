"use client";
/* eslint-disable @next/next/no-img-element -- Project images and signatures are saved private data URLs. */
import Link from 'next/link';
import { useRef, useState, type ReactNode } from 'react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { SavedContractDocument } from '@/components/contracts/SavedContractDocument';
import { ContractRevisionActions } from '@/components/contracts/ContractRevisionActions';
import type { ContractDocumentRevision } from '@/lib/contracts/documentRevisions';
import { canPrepareQuotation } from '@/lib/auth/permissions';
import { normalizeCurtainWallCapture, normalizeSkylightCapture } from '@/lib/measurements/registrationOpening';
import { followUpTypeLabel } from '@/lib/workflow/followUps';
import { stageDetails } from '@/lib/workflow/stages';
import type { ProjectOverviewData, ProjectOverviewOpening } from '@/lib/workflow/projectOverview';
import { ProjectRecord } from './ProjectRecord';
import { MeasurementDelayNotice } from '@/components/measurements/MeasurementDelayNotice';
import { FollowUpHistoryTable, FollowUpPrintButton } from './ProjectFollowUps';
import { DocumentFooter, DocumentHeader, DocumentPaper, DocumentParties, OpeningSchedule } from './CommercialDocument';
import { api, card, Notice, secondary, useResource, Workspace } from './ui';

const sections = [
 { id: 'overview', label: 'Project overview' },
 { id: 'measurements', label: 'Measurements' },
 { id: 'follow-ups', label: 'Follow-up history' },
 { id: 'quotation', label: 'Quotation' },
 { id: 'contract', label: 'Contract' },
] as const;
type Section = typeof sections[number]['id'];

function Details({ items }: { items: [string, ReactNode][] }) {
 const { term } = useI18n();
 return <dl className="grid min-w-0 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
  {items.filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) => <div key={label} className="min-w-0">
   <dt className="text-slate-500">{term(label)}</dt><dd dir="auto" className="mt-1 whitespace-pre-wrap break-words font-medium text-slate-900 [overflow-wrap:anywhere]">{value}</dd>
  </div>)}
 </dl>;
}

function ProjectInformation({ data }: { data: ProjectOverviewData }) {
 const { term, formatDateTime } = useI18n();
 const { project, client } = data;
 const contactTypes = { client: 'Client', company: 'Company', engineer: 'Engineer', consultant: 'Consultant', contractor: 'Contractor', procurement: 'Procurement', finance: 'Finance', other: 'Other' };
 return <div className="space-y-5">
  <section className={card} aria-label={term('Project information')}>
   <h2 className="mb-5 text-lg font-semibold">{term('Project information')}</h2>
   <Details items={[
    ['Project number', project.project_number], ['Project stage', term(stageDetails(project).label)],
    ['Site readiness', term(project.structure_readiness === 'ready' ? 'Ready' : 'Not ready')],
    ['Responsible Indoor Sales', project.followUpOwner ?? term('Not assigned')],
    ['Next follow-up', project.next_follow_up_at ? formatDateTime(project.next_follow_up_at) : term('No follow-up scheduled yet.')],
    ['Follow-up type', term(followUpTypeLabel(project.follow_up_type))], ['Follow-up details', project.follow_up_detail],
    ['Latest follow-up note', project.project_notes], ['Reason not ready for measurement', project.readiness_note],
    ['Cancellation reason', project.client_cancellation_note],
    ['Cancelled by', project.clientCancelledBy], ['Measurements delayed by', project.measurementDelayedBy],
    ['Measurement area', project.measurement_branch ? term(project.measurement_branch) : null],
    ['Measurement rotation exception', project.measurement_exception_reason],
    ['Last updated', formatDateTime(project.updated_at)],
   ]}/>
   <MeasurementDelayNotice project={project}/>
  </section>
  <ProjectRecord projectId={project.id} project={project}/>
  <section className={card} aria-label={term('Client details')}>
   <h2 className="mb-5 text-lg font-semibold">{term('Client details')}</h2>
   {client ? <Details items={[
    ['Client name', client.name], ['Client type', term(client.client_type === 'company' ? 'Company' : 'Individual')],
    ['Company name', client.company_name], ['Phone', client.mobile], ['Alternate mobile', client.alternate_mobile],
    ['WhatsApp', client.whatsapp], ['Email', client.email], ['Preferred language', term(client.preferred_language === 'ar' ? 'Arabic' : 'English')],
    ['Address', client.address], ['Province', client.province], ['City', client.city], ['Notes', client.notes],
   ]}/> : <p className="text-sm text-slate-500">{term('No client details recorded.')}</p>}
  </section>
  <section className={card} aria-label={term('Project contacts')}>
   <h2 className="mb-5 text-lg font-semibold">{term('Project contacts')}</h2>
   {!data.contacts.length ? <p className="text-sm text-slate-500">{term('No additional contacts recorded.')}</p> : <div className="grid gap-4 sm:grid-cols-2">{data.contacts.map(contact => <article key={contact.id} className="min-w-0 rounded-md border border-slate-200 p-4">
    <h3 dir="auto" className="break-words font-semibold">{contact.contact_name}</h3>
    <p className="mt-1 text-sm text-slate-500">{term(contact.role_title || contactTypes[contact.contact_type])}</p>
    <div className="mt-4"><Details items={[
     ['Phone', contact.mobile], ['WhatsApp', contact.whatsapp], ['Email', contact.email],
    ]}/></div>
   </article>)}</div>}
  </section>
 </div>;
}

function OpeningInformation({ opening }: { opening: ProjectOverviewOpening }) {
 const { term, formatNumber, formatDateTime } = useI18n();
 const curtain = normalizeCurtainWallCapture(opening.curtain_wall_capture);
 const skylight = normalizeSkylightCapture(opening.skylight_capture);
 return <article className="min-w-0 rounded-md border border-slate-200 p-4">
  <h3 className="font-semibold">{term(opening.opening_type)} {term(opening.opening_direction)}</h3>
  <p className="mt-2 text-sm text-slate-600">{term(opening.floor)} · {term(opening.room)}{opening.work_area ? ` · ${term(opening.work_area === 'internal' ? 'Internal works' : 'Facade')}` : ''}</p>
  <p className="mt-2 text-sm font-medium"><bdi dir="ltr">{formatNumber(opening.width)} × {formatNumber(opening.height)}</bdi> {term('cm')} · {term('Quantity')}: {formatNumber(opening.quantity ?? 1)}</p>
  <div className="mt-4"><Details items={[
   ['Opening code', opening.opening_code], ['System / product', opening.product_system], ['Glass', opening.glass_type],
   ['Aluminum color', opening.aluminum_color], ['Glass color', opening.glass_color], ['Bottom frame', opening.bottom_frame],
   ['Shape', opening.shape], ['Arch', opening.has_arch ? term('Yes') : null], ['Roller shutter', opening.has_roller_shutter ? term('Yes') : null],
   ['Solid panel height (cm)', opening.solid_panel_height > 0 ? formatNumber(opening.solid_panel_height) : null],
   ['Fixed height (cm)', opening.fixed_height > 0 ? formatNumber(opening.fixed_height) : null], ['Notes', opening.notes],
  ]}/></div>
  {curtain?.note && <p className="mt-4 whitespace-pre-wrap break-words text-sm">{curtain.note}</p>}
  {curtain?.photo && <img src={curtain.photo} alt={term('Curtain Wall photo')} className="mt-4 max-h-80 w-full rounded-md object-contain"/>}
  {skylight && <div className="mt-4 space-y-3 text-sm">{skylight.sections.map((section, index) => <p key={index}><bdi>{section.label}</bdi> · <bdi dir="ltr">{formatNumber(section.width)} × {formatNumber(section.length)}</bdi> {term('cm')}</p>)}
   {skylight.photo && <img src={skylight.photo} alt={term('Skylight photo')} className="max-h-80 w-full rounded-md object-contain"/>}
   {skylight.drawing && <img src={skylight.drawing} alt={term('Skylight drawing')} className="max-h-80 w-full rounded-md object-contain"/>}
  </div>}
  <p className="mt-4 text-xs text-slate-500">{term('Recorded by')}: {opening.recordedBy} · {formatDateTime(opening.updated_at)}</p>
 </article>;
}

function ProjectMeasurements({ data }: { data: ProjectOverviewData }) {
 const { term, formatDateTime, formatNumber } = useI18n();
 const [photos, setPhotos] = useState<Record<string, string>>({});
 const [busy, setBusy] = useState('');
 const [error, setError] = useState('');
 async function loadPhoto(id: string) {
  setBusy(id); setError('');
  try {
   const result = await api<{ photo: string | null }>(`/api/projects/${data.project.id}?report=${encodeURIComponent(id)}`);
   const photo = result.photo;
   if (!photo) throw new Error('Unable to load measurement photo.');
   setPhotos(current => ({ ...current, [id]: photo }));
  } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load measurement photo.'); }
  finally { setBusy(''); }
 }
 return <div className="space-y-5">
  <section className={card}><h2 className="mb-5 text-lg font-semibold">{term('Measurements')}</h2>
   {!data.openings.length ? <p className="text-sm text-slate-500">{term('No openings recorded yet.')}</p> : <div className="grid gap-4 lg:grid-cols-2">{data.openings.map(opening => <OpeningInformation key={opening.id} opening={opening}/>)}</div>}
  </section>
  <section className={card} aria-label={term('Measurement notes and photos')}><h2 className="mb-5 text-lg font-semibold">{term('Measurement notes and photos')}</h2><Notice error={error}/>
   {!data.measurementReports.length ? <p className="text-sm text-slate-500">{term('No measurement notes recorded.')}</p> : <div className="space-y-4">{data.measurementReports.map(report => <article key={report.id} className="border-t border-slate-100 pt-4 text-sm">
    <p className="text-slate-500">{report.recorded_by_name} · {formatDateTime(report.recorded_at)}</p>
    {report.note && <p dir="auto" className="mt-2 whitespace-pre-wrap break-words">{report.note}</p>}
    {photos[report.id] ? <img src={photos[report.id]} alt={term('Measurement site photo')} className="mt-3 max-h-80 w-full rounded-md object-contain"/> : report.has_photo && <button type="button" disabled={!!busy} onClick={() => void loadPhoto(report.id)} className={`${secondary} mt-3`}>{term(busy === report.id ? 'Loading…' : 'View site photo')}</button>}
   </article>)}</div>}
  </section>
  {!!data.project.measurement_attempts?.length && <section className={card}><h2 className="mb-5 text-lg font-semibold">{term('Measurement visit history')}</h2><div className="space-y-4">{data.project.measurement_attempts.map(entry => <article key={entry.id} className="border-t border-slate-100 pt-3 text-sm">
   <p className="font-medium">{term(entry.action === 'finish' ? 'Measurements submitted' : entry.action === 'delay-measurements' ? 'Visit needs rescheduling' : 'Measurements assigned')}</p>
   <p className="mt-1 text-slate-500">{entry.recordedBy} · {formatDateTime(entry.recordedAt)}</p>
   {entry.reason && <p className="mt-2">{term(entry.reason === 'client_no_answer' ? 'Client did not answer' : entry.reason === 'site_closed' ? 'Site was closed' : 'Client requested a delay')}</p>}
   {entry.note && <p className="mt-2 whitespace-pre-wrap break-words">{entry.note}</p>}
  </article>)}</div></section>}
  {!!data.sizeHistory.length && <section className={card}><h2 className="mb-5 text-lg font-semibold">{term('Opening size history')}</h2><div className="space-y-4">{data.sizeHistory.map(entry => <article key={entry.id} className="border-t border-slate-100 pt-3 text-sm">
   <p><bdi dir="ltr">{formatNumber(entry.previous_width)} × {formatNumber(entry.previous_height)} → {formatNumber(entry.width)} × {formatNumber(entry.height)}</bdi> {term('cm')} · {term('Quantity')}: {formatNumber(entry.quantity)}</p>
   <p className="mt-1 text-slate-500">{entry.changed_by_name ?? term('Employee')} · {formatDateTime(entry.changed_at)}</p><p className="mt-2 whitespace-pre-wrap break-words">{entry.reason}</p>
  </article>)}</div></section>}
 </div>;
}

function ProjectDocuments({ data, kind, onRevisionUpdated }: { data: ProjectOverviewData; kind: 'quotation' | 'contract'; onRevisionUpdated: (revision: ContractDocumentRevision) => void }) {
 const { term, formatNumber, formatDateTime } = useI18n();
 const [selectedVersion, setVersion] = useState<string | null>(null);
 const version = selectedVersion ?? (kind === 'contract' && data.documentRevisions?.length ? `document-${data.documentRevisions[0].id}` : 'current');
 const [printing, setPrinting] = useState(false);
 const [error, setError] = useState('');
 const revision = version === 'current' ? null : data.history.find(row => String(row.version) === version);
 const documentRevision = version.startsWith('document-') ? data.documentRevisions?.find(row => `document-${row.id}` === version) : null;
 const quote = version === 'current' ? data.flow?.quotation : revision?.quotation;
 const contract = documentRevision?.contract ?? (version === 'current' ? data.flow?.contract : revision?.contract);
 const present = kind === 'quotation' ? quote : contract;
 const history = data.history.filter(row => kind === 'quotation' || row.contract);
 async function printDocument() {
  setPrinting(true); setError('');
  try { await document.fonts.ready; await Promise.all(Array.from(document.querySelectorAll<HTMLImageElement>('.commercial-document img')).map(image => image.decode())); window.print(); }
  catch { setError('Unable to prepare this document for printing.'); }
  finally { setPrinting(false); }
 }
 return <div className="space-y-5">
  <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
   <label className="block text-sm font-medium">{term(kind === 'quotation' ? 'Quotation version' : 'Contract version')}
    <select aria-label={term(kind === 'quotation' ? 'Quotation version' : 'Contract version')} value={version} onChange={event => { setVersion(event.target.value); setError(''); }} className="mt-2 block min-h-11 max-w-full rounded-md border border-slate-300 bg-white px-3 py-2">
     <option value="current">{kind === 'contract' && data.documentRevisions?.length ? term('Original contract') : term('Revision {number} · Current', { number: formatNumber((kind === 'contract' ? data.flow?.contract?.quotation.version : data.flow?.quotation.version) ?? 1) })}</option>
     {kind === 'contract' && data.documentRevisions?.map(row => <option key={row.id} value={`document-${row.id}`}>{term('Contract revision {number}', { number: formatNumber(row.document_revision) })} · {term(row.superseded_at ? 'Superseded revision' : row.status === 'signed' ? 'Signed' : row.status === 'approved' ? 'Approved · Awaiting signature' : 'Awaiting approval')}</option>)}
     {history.map(row => <option key={row.version} value={row.version}>{term('Revision {number} · Superseded', { number: formatNumber(row.version) })}</option>)}
    </select>
   </label>
   <div className="flex flex-wrap gap-3">
    {kind === 'contract' && version === 'current' && data.signedCopyAvailable && <a href={`/api/projects/${data.project.id}?download=signed`} className={`${secondary} inline-flex items-center`}>{term('Download signed copy')}</a>}
    {present && <button type="button" disabled={printing} onClick={() => void printDocument()} className={secondary}>{term(printing ? 'Preparing print…' : kind === 'quotation' ? 'Print quotation' : 'Print contract')}</button>}
   </div>
  </div>
  <Notice error={error}/>
  {documentRevision && <ContractRevisionActions key={`${documentRevision.id}-${documentRevision.revision}`} documentRevision={documentRevision} canManage={canPrepareQuotation(data.actor.role)} onUpdated={onRevisionUpdated}/>}
  {kind === 'contract' && version === 'current' && data.flow?.signed_at && <p className="text-sm text-green-800 print:hidden">{term('Signed on')}: {formatDateTime(data.flow.signed_at)} · {data.flow.evidence?.signer}</p>}
  {!present ? <div className={card}><p className="text-sm text-slate-500">{term(kind === 'quotation' ? 'No quotation has been saved for this project yet.' : 'No contract has been generated for this project yet.')}</p></div> : kind === 'quotation' && quote ? <DocumentPaper>
   <DocumentHeader kind="Quotation" number={`QT-${data.project.project_number}-${quote.version ?? 1}`} createdAt={quote.createdAt}/>
   <DocumentParties client={{ name: data.client?.name ?? data.project.client_name ?? '—', mobile: data.client?.mobile ?? null }} project={{ name: data.project.project_name, number: data.project.project_number, address: data.project.address, branch: data.project.branch, governorate: data.project.governorate }}/>
   <OpeningSchedule quote={quote} areaBasis="billable"/><DocumentFooter reference={`QT-${data.project.project_number}-${quote.version ?? 1}`}/>
  </DocumentPaper> : contract ? <SavedContractDocument contract={contract} signedAt={documentRevision ? documentRevision.signed_at : version === 'current' ? data.flow?.signed_at : null} evidence={documentRevision ? documentRevision.evidence : version === 'current' ? data.flow?.evidence : null} documentRevision={documentRevision}/> : null}
 </div>;
}

export function ProjectOverview({ projectId, initialSection = 'overview' }: { projectId: string; initialSection?: Section }) {
 const { term, direction } = useI18n();
 const { data, setData, error, loading, reload } = useResource<ProjectOverviewData>(`/api/projects/${projectId}`);
 const [section, setSection] = useState<Section>(initialSection);
 const tabs = useRef<(HTMLButtonElement | null)[]>([]);
 return <Workspace title={data?.project.project_name ?? term('Project overview')} description={data ? data.project.project_number : term('Project information, measurements, history and commercial documents.')}>
  <div className="mb-5 flex flex-wrap justify-between gap-3 print:hidden"><Link href="/dashboard" className={`${secondary} inline-flex items-center`}>{term('Back to dashboard')}</Link><button type="button" disabled={loading} onClick={() => void reload()} className={secondary}>{term('Refresh records')}</button></div>
  <Notice error={error}/>
  {loading ? <p role="status">{term('Loading project information…')}</p> : data && <>
   {!!data.warnings.length && <aside className="mb-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 print:hidden" role="status">{data.warnings.map(warning => <p key={warning}>{term(warning)}</p>)}</aside>}
   <nav aria-label={term('Project sections')} className="mb-6 print:hidden"><div role="tablist" aria-label={term('Project sections')} className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
    {sections.map((item, index) => <button key={item.id} ref={node => { tabs.current[index] = node; }} type="button" role="tab" id={`project-tab-${item.id}`} aria-controls={`project-section-${item.id}`} aria-selected={section === item.id} tabIndex={section === item.id ? 0 : -1} onClick={() => setSection(item.id)} onKeyDown={event => {
     const step = event.key === 'ArrowRight' ? (direction === 'rtl' ? -1 : 1) : event.key === 'ArrowLeft' ? (direction === 'rtl' ? 1 : -1) : 0;
     if (!step && event.key !== 'Home' && event.key !== 'End') return;
     event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : (index + step + sections.length) % sections.length;
     setSection(sections[next].id); tabs.current[next]?.focus();
    }} className={`min-h-11 rounded-md border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${section === item.id ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>{term(item.label)}</button>)}
   </div></nav>
   <section role="tabpanel" id={`project-section-${section}`} aria-labelledby={`project-tab-${section}`}>
    {section === 'overview' && <ProjectInformation data={data}/>}
    {section === 'measurements' && <ProjectMeasurements key={projectId} data={data}/>}
    {section === 'follow-ups' && <section className={card}><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{term('Follow-up history')}</h2><FollowUpPrintButton history={data.followUps}/></div><FollowUpHistoryTable entries={data.followUps.entries}/></section>}
    {(section === 'quotation' || section === 'contract') && <ProjectDocuments key={`${projectId}-${section}`} data={data} kind={section} onRevisionUpdated={updated => setData(current => current ? { ...current, documentRevisions: (current.documentRevisions ?? []).map(row => row.id === updated.id ? updated : row) } : current)}/>}
   </section>
  </>}
 </Workspace>;
}
