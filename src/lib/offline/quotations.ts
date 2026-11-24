import { canPrepareQuotation } from '@/lib/auth/permissions';
import { canAccessProjectRow } from '@/lib/auth/projectBranchAccess';
import { normalizeCatalogItem } from '@/lib/workflow/catalogRules';
import { applyOpeningSizeChanges, normalizeOpeningSizeChanges, priceQuotationWithSizeChanges } from '@/lib/workflow/openingSizeChanges';
import { normalizeExcludedOpeningIds, quotationOpenings } from '@/lib/workflow/quotationOpenings';
import { QUOTATION_DISCOUNTS_ENABLED, type AdditionalChoice, type CatalogItem, type OpeningChoice, type QuoteSnapshot } from '@/lib/workflow/pricing';
import { reviseSharedQuotationPrices } from '@/lib/quotations/sharedPrices';
import { activeFieldUser, readStoredFieldState, updateFieldState, type FieldChangeDetail } from './store';
import type { FieldState } from './types';
import type { OfflineQuotationData, OfflineQuotationEntry, OfflineQuotationOperation, OfflineQuotationReview, OfflineQuotationState } from './quotationTypes';
import { canUseOfflineWorkspace, indoorOnlineRequiredMessage, isIndoorOnlineUser } from './policy';

const endpoint = '/api/offline/quotations';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const blockedAction = 'Connect to the internet and sync saved quotations before approving, signing, or generating contracts.';
const changedAccount = 'Sign in with the employee who saved this quotation.';
const revoked = 'Quotation access changed. Your saved draft is retained on this device and cannot be synchronized.';
const empty = (): OfflineQuotationState => ({ entries: [], queue: [], archived: [], downloadedAt: null });
const online = () => typeof navigator !== 'undefined' && navigator.onLine;
let generation = 0;
let preparing: { actor: string; generation: number; promise: Promise<void> } | null = null;
let synchronizing: Promise<void> | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('field-change', event => {
    const detail = (event as CustomEvent<FieldChangeDetail>).detail;
    if (detail?.source === 'account' || detail?.actorScopeChanged) generation++;
  });
  window.addEventListener('storage', event => { if (event.key === 'alumex-field-active') generation++; });
}

function context() {
  const actor = activeFieldUser();
  if (!actor) throw new Error('Sign in online to prepare quotations for this device.');
  const epoch = generation;
  return { actor, check() { if (activeFieldUser() !== actor || generation !== epoch) throw new Error(changedAccount); } };
}

export function canAccessOfflineQuotation(state: FieldState, entry: OfflineQuotationEntry | undefined): entry is OfflineQuotationEntry {
  if (!entry?.available || !canPrepareQuotation(state.actor.role as Parameters<typeof canPrepareQuotation>[0])) return false;
  return entry.data.quotationAccess === 'prices'
    ? state.actor.role === 'Indoor Sales'
    : canAccessProjectRow(state.actor, entry.data.project);
}
const available = canAccessOfflineQuotation;

function permitsDraft(entry: OfflineQuotationEntry, operation: OfflineQuotationOperation): boolean {
  return entry.data.quotationAccess !== 'prices'
    || operation.body.action === 'save-shared-prices' && operation.base.quotationAccess === 'prices'
      && operation.draft.quotationAccess === 'prices'
      && (!operation.successor || operation.successor.body.action === 'save-shared-prices' && operation.successor.draft.quotationAccess === 'prices');
}

export function canAccessOfflineQuotationDraft(state: FieldState, operation: OfflineQuotationOperation): boolean {
  const entry = state.quotations?.entries.find(item => item.projectId === operation.projectId);
  return available(state, entry) && permitsDraft(entry, operation);
}

// A full editor draft cannot become a price-only draft by changing its access
// flag. Keep the original work intact for recovery if full access is restored.
function archiveNarrowedDrafts(state: OfflineQuotationState): OfflineQuotationState {
  const narrowed = state.queue.filter(operation => {
    const entry = state.entries.find(item => item.projectId === operation.projectId);
    return entry?.available && !permitsDraft(entry, operation);
  });
  if (!narrowed.length) return state;
  const ids = new Set(narrowed.map(operation => operation.id));
  return { ...state, queue: state.queue.filter(operation => !ids.has(operation.id)), archived: [...state.archived,
    ...narrowed.map(operation => ({ operation, archivedAt: new Date().toISOString(), reason: 'Quotation editing access changed. The original draft is retained until full access is restored.' })),
  ] };
}

function validData(value: unknown): value is OfflineQuotationData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<OfflineQuotationData>;
  return !!data.project && typeof data.project.project_number === 'string' && !!data.client
    && Array.isArray(data.openings) && Array.isArray(data.catalog) && Array.isArray(data.history)
    && (data.flow === null || !!data.flow && Number.isInteger(data.flow.revision));
}

function safeData(data: OfflineQuotationData): OfflineQuotationData {
  const copy = structuredClone(data);
  delete copy.offlineQuotation;
  const { id, project_name, project_number, address, building_type, branch, governorate, governorate_office, created_by, assigned_outdoor_sales_id, sales_status, additional_openings_state } = copy.project;
  copy.project = { id, project_name, project_number, address, building_type, branch, governorate, governorate_office, created_by, assigned_outdoor_sales_id, sales_status, additional_openings_state };
  copy.client = { name: copy.client.name, mobile: copy.client.mobile, client_type: copy.client.client_type };
  if (copy.flow?.evidence) {
    // Keep a truthy lock without storing signatures or private file locations.
    copy.flow.evidence = { method: copy.flow.evidence.method, signer: '' };
  }
  copy.history = [];
  if (copy.flow) {
    const flow = copy.flow;
    copy.flow = { project_id: flow.project_id, revision: flow.revision, stage: flow.stage, quotation: flow.quotation,
      contract: null, evidence: flow.evidence, signed_at: flow.signed_at, accepted_at: flow.accepted_at, accepted_by: flow.accepted_by };
  }
  return copy;
}

function assertEditable(data: OfflineQuotationData, body: Record<string, unknown>) {
  const flow = data.flow;
  if (['contract_signed', 'transferred_to_operations', 'cancelled', 'lost', 'closed'].includes(data.project.sales_status)
    || flow && (flow.signed_at || flow.evidence || flow.accepted_at || flow.accepted_by || !['quotation', 'approved', 'contract'].includes(flow.stage))) {
    throw new Error('Signed contracts and closed quotations cannot be changed.');
  }
  if (data.project.additional_openings_state === 'requested'
    || body.action === 'save-shared-prices' && data.project.additional_openings_state) {
    throw new Error('Complete the additional measurements before saving this quotation.');
  }
  if (flow?.stage === 'contract' && body.replaceUnsignedContract !== true) {
    throw new Error('Confirm that this revision replaces the unsigned contract and requires new client approval.');
  }
  if (data.quotationAccess === 'prices' && body.action !== 'save-shared-prices') throw new Error('Shared access permits quotation price editing only.');
  if (body.action === 'save-shared-prices' && !flow) throw new Error('A saved quotation is required before editing its prices.');
}

// The request, cached server snapshot and catalog are never mutated. Local
// amounts are a draft; the existing server transaction validates them again.
export function projectOfflineQuotation(data: OfflineQuotationData, body: Record<string, unknown>, actor: string): OfflineQuotationData {
  if (!['save', 'save-shared-prices'].includes(String(body.action))) throw new Error(blockedAction);
  assertEditable(data, body);
  let quotation: QuoteSnapshot;
  let openings = data.openings;
  if (body.action === 'save-shared-prices') {
    quotation = reviseSharedQuotationPrices(data.flow!.quotation, { systemRates: body.systemRates, additionalRates: body.additionalRates }, data.catalog, actor);
  } else {
    if (!Array.isArray(body.choices)) throw new Error('Select a system for every opening.');
    const changes = normalizeOpeningSizeChanges(data.openings, body.openingSizeChanges ?? []);
    const measured = quotationOpenings(applyOpeningSizeChanges(data.openings, changes), body.newOpenings ?? []);
    if (measured.slice(data.openings.length).some(opening => opening.opening_type === 'Facade') && data.project.building_type !== 'commercial_building') {
      throw new Error('Facade and Internal works are only available for commercial buildings.');
    }
    const exclusions = normalizeExcludedOpeningIds(data.openings, body.excludedOpeningIds ?? data.flow?.quotation.excludedOpeningIds ?? []);
    if (changes.some(change => exclusions.includes(change.openingId))) throw new Error('Restore the opening to the quotation before changing its size.');
    const discount = body.discountPercent ?? (QUOTATION_DISCOUNTS_ENABLED ? data.flow?.quotation.discount?.percent ?? 0 : 0);
    if (!QUOTATION_DISCOUNTS_ENABLED && discount !== 0) throw new Error('Quotation discounts are temporarily unavailable.');
    quotation = {
      ...priceQuotationWithSizeChanges(measured.filter(opening => !exclusions.includes(opening.id)), body.choices as OpeningChoice[], data.catalog.map(normalizeCatalogItem), actor,
        (body.additionalItems ?? []) as AdditionalChoice[], discount, data.flow?.quotation, changes, data.flow?.quotation.pricingPolicy),
      ...(changes.length ? { openingSizeChanges: changes, replaceUnsignedContract: body.replaceUnsignedContract === true } : {}),
      ...(exclusions.length ? { excludedOpeningIds: exclusions } : {}),
      branch: data.project.branch, governorate: data.project.governorate ?? null,
    };
    openings = measured;
  }
  quotation.version = (data.flow?.quotation.version ?? (data.flow ? 1 : 0)) + 1;
  return {
    ...structuredClone(data), openings,
    project: { ...data.project, sales_status: 'quotation_in_progress', additional_openings_state: null },
    flow: { ...data.flow, project_id: data.flow?.project_id ?? data.project.id ?? '', revision: data.flow?.revision ?? 0, stage: 'quotation', quotation, contract: null, evidence: null, signed_at: null, accepted_at: null, accepted_by: null },
  };
}

function pendingData(state: OfflineQuotationState, entry: OfflineQuotationEntry): OfflineQuotationData {
  const pending = state.queue.find(operation => operation.projectId === entry.projectId && permitsDraft(entry, operation));
  return pending ? { ...(pending.successor?.draft ?? pending.draft), offlineQuotation: { pending: true, recordedAt: pending.successor?.recordedAt ?? pending.recordedAt, ...(pending.error ? { error: pending.error } : {}) } } : entry.data;
}

export function quotationSyncStatus(state: FieldState | null): { pending: number; error: string | null } {
  const queue = state?.quotations?.queue ?? [];
  return { pending: queue.length, error: queue.find(operation => operation.error)?.error ?? null };
}

export async function prepareOfflineQuotations({ background = false }: { background?: boolean } = {}): Promise<void> {
  if (!online() || !activeFieldUser()) return;
  const run = context();
  if (preparing?.actor === run.actor && preparing.generation === generation) return preparing.promise;
  const promise = (async () => {
    const stored = await readStoredFieldState(run.actor); run.check();
    if (!stored || !canUseOfflineWorkspace(stored.actor.role) || isIndoorOnlineUser(run.actor) || !canPrepareQuotation(stored.actor.role as Parameters<typeof canPrepareQuotation>[0])) return;
    const downloaded = stored.quotations?.downloadedAt;
    if (background && downloaded && Date.now() - Date.parse(downloaded) < 60000) return;
    const receivedEntries: { projectId: string; data: OfflineQuotationData }[] = [];
    const visited = new Set<string>();
    let cursor: string | null = null;
    let sharedCatalog: CatalogItem[] | undefined;
    let snapshotActor: { id?: string; role?: string; branch?: string | null } | undefined;
    do {
      const response = await fetch(cursor ? `${endpoint}?cursor=${encodeURIComponent(cursor)}` : endpoint, { cache: 'no-store', signal: AbortSignal.timeout(30000) }); run.check();
      if (!response.ok) throw new Error(response.status === 401 ? 'Sign in online to synchronize saved quotations.' : 'Unable to refresh saved quotations. Your local drafts are retained.');
      const remote = await response.json() as { actor?: { id?: string; role?: string; branch?: string | null }; quotations?: { projectId: string; data: OfflineQuotationData }[]; catalog?: CatalogItem[]; nextCursor?: string | null; complete?: boolean };
      run.check();
      if (remote.actor?.id !== run.actor || !Array.isArray(remote.quotations) || snapshotActor && canonical(remote.actor) !== canonical(snapshotActor)) throw new Error('The quotation download is incomplete. Your saved drafts are retained.');
      snapshotActor ??= remote.actor;
      if (remote.catalog) {
        if (sharedCatalog && canonical(remote.catalog) !== canonical(sharedCatalog)) throw new Error('Catalog prices changed during download. Refresh quotations again.');
        sharedCatalog ??= structuredClone(remote.catalog);
      }
      const entries = remote.quotations.map(entry => ({ ...entry, data: { ...entry.data, catalog: sharedCatalog ?? entry.data.catalog } }));
      if (entries.some(entry => !uuid.test(entry.projectId) || !validData(entry.data) || receivedEntries.some(previous => previous.projectId === entry.projectId))) throw new Error('The quotation download is incomplete. Your saved drafts are retained.');
      receivedEntries.push(...entries);
      cursor = remote.nextCursor ?? null;
      if (cursor && (!uuid.test(cursor) || visited.has(cursor)) || remote.complete === false && !cursor) throw new Error('The quotation download is incomplete. Your saved drafts are retained.');
      if (cursor) visited.add(cursor);
    } while (cursor);
    const downloadedAt = new Date().toISOString();
    let permissionLost = false;
    await updateFieldState(run.actor, state => {
      run.check(); if (!state || state.actor.id !== run.actor) throw new Error(changedAccount);
      const current = state.quotations ?? empty();
      if (snapshotActor?.role && snapshotActor.role !== state.actor.role || snapshotActor?.branch !== undefined && snapshotActor.branch !== state.actor.branch) throw new Error('Your employee scope changed. Refresh the device workspace before downloading quotations.');
      const received = new Set(receivedEntries.map(entry => entry.projectId));
      permissionLost = current.entries.some(entry => entry.available && (!received.has(entry.projectId)
        || entry.data.quotationAccess !== 'prices' && receivedEntries.find(item => item.projectId === entry.projectId)?.data.quotationAccess === 'prices'));
      const entries: OfflineQuotationEntry[] = receivedEntries.map(entry => ({ ...entry, data: { ...safeData(entry.data), ...(sharedCatalog ? { catalog: sharedCatalog } : {}) }, available: true, downloadedAt }));
      const missing = current.entries.filter(entry => !received.has(entry.projectId) && current.queue.some(operation => operation.projectId === entry.projectId));
      entries.push(...missing.map(entry => ({ ...entry, available: false })));
      const queue = current.queue.map(operation => received.has(operation.projectId) ? operation : { ...operation, error: revoked, status: 403 });
      return { ...state, quotations: archiveNarrowedDrafts({ ...current, entries, queue, downloadedAt }) };
    }, 'snapshot');
    // Ordinary refreshes leave an unfinished form alone. A permission loss
    // must immediately remove already-rendered private quotation content.
    if (permissionLost) { run.check(); generation++; window.dispatchEvent(new Event('field-change')); }
  })();
  const request = { actor: run.actor, generation, promise }; preparing = request;
  try { await promise; } finally { if (preparing === request) preparing = null; }
}

async function cacheResponse(projectId: string, data: OfflineQuotationData, run: ReturnType<typeof context>) {
  await updateFieldState(run.actor, state => {
    run.check(); if (!state || state.actor.id !== run.actor) throw new Error(changedAccount);
    const current = state.quotations ?? empty();
    const entry = { projectId, data: safeData(data), available: true, downloadedAt: new Date().toISOString() };
    return { ...state, quotations: archiveNarrowedDrafts({ ...current, entries: [...current.entries.filter(item => item.projectId !== projectId), entry] }) };
  }, 'snapshot');
}

async function markFailure(run: ReturnType<typeof context>, operation: OfflineQuotationOperation, status: number, message: string) {
  await updateFieldState(run.actor, state => {
    run.check(); if (!state) throw new Error(changedAccount);
    const current = state.quotations ?? empty();
    return { ...state, quotations: { ...current,
      queue: current.queue.map(item => item.id === operation.id ? { ...item, error: message, status, conflict: status === 409 } : item),
      entries: status === 403 || status === 404 ? current.entries.map(entry => entry.projectId === operation.projectId ? { ...entry, available: false } : entry) : current.entries,
    } };
  });
}

export async function syncOfflineQuotations(): Promise<void> {
  if (!online() || !activeFieldUser()) return;
  if (synchronizing) return synchronizing;
  const run = context();
  const sync = async () => {
    run.check();
    let state = await readStoredFieldState(run.actor); run.check();
    if (!state?.quotations?.queue.length || !canPrepareQuotation(state.actor.role as Parameters<typeof canPrepareQuotation>[0])) return;
    const session = await fetch('/api/offline?session=1', { cache: 'no-store', signal: AbortSignal.timeout(8000) }).catch(() => null); run.check();
    if (!session) return;
    if (!session.ok) {
      if (session.status === 401 || session.status === 403) for (const operation of state.quotations.queue) await markFailure(run, operation, session.status, 'Sign in with the employee who saved these quotation drafts before synchronizing.');
      return;
    }
    const identity = await session.json() as { actor?: { id?: string } }; run.check();
    if (identity.actor?.id !== run.actor) throw new Error(changedAccount);
    const attempted = new Set<string>();
    while (online()) {
      state = await readStoredFieldState(run.actor); run.check();
      const operation = state?.quotations?.queue.find(item => !attempted.has(item.id) && !item.conflict && (!item.status || item.status >= 500 || item.status === 401)
        && canAccessOfflineQuotationDraft(state!, item));
      if (!operation) return;
      attempted.add(operation.id);
      // Publish attemptedAt before transmitting. Another tab cannot coalesce a
      // new body into an operation that may already have committed remotely.
      let sent: OfflineQuotationOperation | undefined;
      await updateFieldState(run.actor, current => {
        run.check(); if (!current?.quotations) throw new Error(changedAccount);
        const quotationState = current.quotations;
        const latest = quotationState.queue.find(item => item.id === operation.id);
        if (!latest || latest.conflict || !canAccessOfflineQuotationDraft(current, latest)) return current;
        sent = { ...latest, attemptedAt: latest.attemptedAt ?? new Date().toISOString() };
        return { ...current, quotations: { ...quotationState, queue: quotationState.queue.map(item => item.id === sent!.id ? sent! : item) } };
      });
      if (!sent) continue;
      let response: Response;
      try {
        response = await fetch(`/api/sales-flow/${sent.projectId}`, { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(20000), headers: {
          'Content-Type': 'application/json', 'X-Alumex-Offline-Operation': sent.id, 'X-Alumex-Offline-Recorded-At': sent.recordedAt, 'X-Alumex-Offline-Actor': sent.userId,
        }, body: JSON.stringify(sent.body) });
      } catch { run.check(); await markFailure(run, sent, 503, 'Quotation saved on this device. Waiting for a connection to synchronize.'); return; }
      run.check();
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; code?: string; operationId?: string; revision?: number; flow?: OfflineQuotationData['flow'] } | null;
      if (!response.ok) {
        if (result?.code === 'OFFLINE_QUOTATION_ACCOUNT_MISMATCH') {
          await markFailure(run, sent, 401, changedAccount); return;
        }
        const message = response.status === 401 ? 'Sign in online to synchronize this saved quotation.'
          : response.status === 403 || response.status === 404 ? revoked
          : result?.error ?? 'The quotation could not synchronize. Your saved draft is retained.';
        await markFailure(run, sent, response.status, message);
        if (response.status === 401) return;
        continue;
      }
      if (result?.ok !== true || result.operationId !== sent.id || !Number.isInteger(result.revision)
        || !result.flow || result.flow.project_id !== sent.projectId || result.flow.revision !== result.revision
        || result.revision! <= Number(sent.body.revision) || !Array.isArray(result.flow.quotation?.lines)) {
        await markFailure(run, sent, 503, 'The server response could not confirm synchronization. Your saved quotation will be retried safely.');
        return;
      }
      // The receipt response is authoritative even when its original HTTP
      // response was lost. Remove only this exact acknowledged operation.
      await updateFieldState(run.actor, current => {
        run.check(); if (!current?.quotations) throw new Error(changedAccount);
        const quoteState = current.quotations;
        const pending = quoteState.queue.find(item => item.id === sent!.id);
        if (!pending) return current;
        const confirmed = { ...pending.draft, flow: result?.flow ?? { ...pending.draft.flow!, revision: (pending.body.revision as number) + 1 } };
        delete confirmed.offlineQuotation;
        let successor: OfflineQuotationOperation | undefined;
        if (pending.successor) {
          const body = { ...pending.successor.body, revision: confirmed.flow?.revision ?? 0 };
          const next = { id: crypto.randomUUID(), userId: run.actor, projectId: pending.projectId, recordedAt: pending.successor.recordedAt, body, base: confirmed };
          try { successor = { ...next, draft: projectOfflineQuotation(confirmed, body, run.actor) }; }
          catch (cause) {
            // Preserve a newer local save even if current server pricing or
            // measurements prevent rebuilding it after its predecessor synced.
            successor = { ...next, draft: pending.successor.draft, error: cause instanceof Error ? cause.message : 'Review your newer saved quotation draft.', conflict: true, status: 409 };
          }
        }
        return { ...current, quotations: { ...quoteState, queue: quoteState.queue.flatMap(item => item.id === sent!.id ? successor ? [successor] : [] : [item]),
          entries: quoteState.entries.map(entry => entry.projectId === sent!.projectId ? { ...entry, data: safeData(confirmed), downloadedAt: new Date().toISOString() } : entry),
        } };
      });
      const refreshed = await fetch(`/api/sales-flow/${sent.projectId}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) }).catch(() => null); run.check();
      if (refreshed?.ok && refreshed.headers.get('X-Alumex-Actor') === run.actor) { const remote: unknown = await refreshed.json(); run.check(); if (validData(remote)) await cacheResponse(sent.projectId, remote, run); }
    }
  };
  // Another tab owns synchronization while it holds this lock. Do not queue
  // behind a suspended tab and keep this tab's recovery controls waiting.
  const promise = (async () => { if ('locks' in navigator) await navigator.locks.request(`alumex-quotation-sync:${run.actor}`, { ifAvailable: true }, lock => lock ? sync() : undefined); else await sync(); })();
  synchronizing = promise;
  try { await promise; } finally { if (synchronizing === promise) synchronizing = null; }
}

async function saveQuotation(projectId: string, body: Record<string, unknown>): Promise<Response> {
  const run = context();
  const recordedAt = new Date().toISOString();
  const operationId = crypto.randomUUID();
  await updateFieldState(run.actor, state => {
    run.check(); if (!state) throw new Error(changedAccount);
    if (!canUseOfflineWorkspace(state.actor.role) || isIndoorOnlineUser(run.actor)) throw new Error(indoorOnlineRequiredMessage);
    const quotations = state.quotations ?? empty();
    const entry = quotations.entries.find(item => item.projectId === projectId);
    if (!available(state, entry)) throw new Error('Open this quotation online once before working on it offline.');
    if (state.queue.some(change => change.projectId === projectId)) throw new Error('Sync this project’s measurements and saved changes before saving its quotation.');
    const previous = quotations.queue.find(item => item.projectId === projectId);
    if (previous && !permitsDraft(entry, previous)) throw new Error('Quotation access changed. Refresh quotations before saving. Your original draft is retained.');
    if (entry.data.quotationAccess === 'prices' && body.action !== 'save-shared-prices') throw new Error('Shared access permits quotation price editing only.');
    const base = previous?.attemptedAt
      ? { ...previous.draft, flow: previous.draft.flow ? { ...previous.draft.flow, revision: (previous.body.revision as number) + 1 } : null }
      : previous?.base ?? entry.data;
    const expectedRevision = base.flow?.revision ?? 0;
    const visibleRevision = previous?.attemptedAt ? (previous.successor?.draft ?? previous.draft).flow?.revision ?? 0 : expectedRevision;
    if (!Number.isInteger(body.revision) || body.revision !== visibleRevision) throw new Error('The quotation changed. Review the latest saved version before saving.');
    let combined = structuredClone(body);
    if (previous && previous.body.action !== body.action) throw new Error('Sync the saved quotation before changing its editing mode.');
    const earlierBody = previous?.attemptedAt ? previous.successor?.body : previous?.body;
    if (earlierBody && body.action === 'save') {
      if (Array.isArray(earlierBody.openingSizeChanges) && earlierBody.openingSizeChanges.length) {
        if (Array.isArray(body.openingSizeChanges) && body.openingSizeChanges.length) throw new Error('Sync the saved opening size changes before editing another size.');
        combined.openingSizeChanges = earlierBody.openingSizeChanges;
      }
      if (Array.isArray(earlierBody.newOpenings)) {
        const prior = earlierBody.newOpenings as { id?: string }[];
        const added = (body.newOpenings ?? []) as { id?: string }[];
        combined.newOpenings = [...prior, ...added.filter(item => !prior.some(old => old.id === item.id))];
      }
    }
    combined = { ...combined, revision: expectedRevision };
    const draft = projectOfflineQuotation(base, combined, run.actor);
    if (previous?.attemptedAt) {
      const successor = { body: combined, draft, recordedAt };
      return { ...state, quotations: { ...quotations, queue: quotations.queue.map(operation => operation.id === previous.id ? { ...operation, successor } : operation) } };
    }
    const operation: OfflineQuotationOperation = { id: previous?.id ?? operationId, userId: run.actor, projectId, recordedAt: previous?.recordedAt ?? recordedAt, body: combined, base, draft };
    return { ...state, quotations: { ...quotations, queue: [...quotations.queue.filter(item => item.projectId !== projectId), operation] } };
  });
  void syncOfflineQuotations().catch(() => {});
  return Response.json({ ok: true, pending: true }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function quotationFetch(url: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const parsed = new URL(url, 'https://alumex.invalid');
  const match = parsed.pathname.match(/^\/api\/sales-flow\/([0-9a-f-]{36})$/i);
  if (!match && parsed.pathname !== '/api/shared-quotations') return fetch(url, init);
  const projectId = match?.[1];
  const activeActor = activeFieldUser();
  const accountState = activeActor ? await readStoredFieldState(activeActor).catch(cause => {
    if (isIndoorOnlineUser(activeActor)) return null;
    throw cause;
  }) : null;
  if (activeActor !== activeFieldUser()) return Response.json({ error: changedAccount }, { status: 401 });
  if (!accountState || !canUseOfflineWorkspace(accountState.actor.role) || isIndoorOnlineUser(activeActor)) {
    if (!online()) return Response.json({ error: indoorOnlineRequiredMessage, code: 'INDOOR_ONLINE_REQUIRED' }, { status: 503 });
    if (method !== 'GET' && projectId && (accountState?.queue.some(item => item.projectId === projectId)
      || accountState?.quotations?.queue.some(item => item.projectId === projectId))) {
      return Response.json({ error: 'Review and synchronize this project’s saved changes before changing its quotation online.' }, { status: 409 });
    }
    // Existing drafts are synchronized only through the recovery flow. Normal
    // quotation work never reads or writes an Indoor Sales device snapshot.
    const onlineRun = activeActor ? context() : null;
    try {
      const response = await fetch(url, { cache: 'no-store', ...init, signal: init?.signal ?? AbortSignal.timeout(20000) });
      onlineRun?.check();
      const responseActor = response.headers.get('X-Alumex-Actor');
      if (activeActor && responseActor && responseActor !== activeActor) return Response.json({ error: changedAccount }, { status: 401 });
      return response;
    } catch (cause) {
      onlineRun?.check();
      if (init?.signal?.aborted) throw cause;
      return Response.json({ error: indoorOnlineRequiredMessage, code: 'INDOOR_ONLINE_REQUIRED' }, { status: 503 });
    }
  }
  if (method !== 'GET') {
    if (typeof FormData !== 'undefined' && init?.body instanceof FormData) {
      const state = await readStoredFieldState();
      if (!online() || projectId && state?.quotations?.queue.some(item => item.projectId === projectId)) return Response.json({ error: blockedAction }, { status: 409 });
      return fetch(url, init);
    }
    let body: Record<string, unknown>;
    try { const value: unknown = JSON.parse(String(init?.body ?? '{}')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); body = value as Record<string, unknown>; }
    catch { return Response.json({ error: 'Invalid quotation request.' }, { status: 400 }); }
    if (method === 'POST' && projectId && ['save', 'save-shared-prices'].includes(String(body.action))) {
      try {
        // An online quotation opened before offline preparation can be cached on
        // demand. All writes still commit to IndexedDB before transmission.
        const actor = activeFieldUser();
        const state = actor ? await readStoredFieldState(actor) : null;
        if (online() && !state?.quotations?.entries.some(entry => entry.projectId === projectId)) await quotationFetch(parsed.pathname);
        return await saveQuotation(projectId, body);
      } catch (cause) { return Response.json({ error: cause instanceof Error ? cause.message : 'Unable to save quotation on this device.' }, { status: 409 }); }
    }
    const state = await readStoredFieldState();
    if (!online() || projectId && state?.quotations?.queue.some(item => item.projectId === projectId)) return Response.json({ error: blockedAction }, { status: 409 });
    return fetch(url, init);
  }
  const run = activeFieldUser() ? context() : null;
  const stored = run ? await readStoredFieldState(run.actor) : null; run?.check();
  const entry = stored?.quotations?.entries.find(item => item.projectId === projectId);
  if (projectId && parsed.searchParams.has('download')) {
    if (!online()) return Response.json({ error: 'Connect to the internet to download signed documents.' }, { status: 409 });
    return fetch(url, init);
  }
  const deviceWorkspace = typeof window !== 'undefined' && window.location?.pathname === '/offline';
  if (stored && available(stored, entry) && (deviceWorkspace || stored.quotations!.queue.some(operation => operation.projectId === projectId))) return Response.json(pendingData(stored.quotations!, entry));
  if (!projectId && deviceWorkspace && stored?.quotations) return Response.json({ projects: stored.quotations.entries.filter(item => available(stored, item) && item.data.quotationAccess === 'prices').map(item => ({ id: item.projectId, ...item.data.project })) });
  if (online()) {
    try {
      const response = await fetch(url, { cache: 'no-store', ...init, signal: init?.signal ?? AbortSignal.timeout(15000) }); run?.check();
      if (response.ok && projectId && run && response.headers.get('X-Alumex-Actor') && response.headers.get('X-Alumex-Actor') !== run.actor) return Response.json({ error: changedAccount }, { status: 401 });
      if (response.ok && projectId && run && stored && response.headers.get('X-Alumex-Actor') === run.actor) {
        const result: unknown = await response.clone().json(); run.check();
        if (validData(result)) await cacheResponse(projectId, result, run);
      }
      if (response.status === 403 || response.status === 404) {
        if (projectId && run) await updateFieldState(run.actor, state => { run.check(); if (!state?.quotations) return state!; return { ...state, quotations: { ...state.quotations, entries: state.quotations.entries.map(item => item.projectId === projectId ? { ...item, available: false } : item) } }; });
        return response;
      }
      if (response.status < 500) return response;
    } catch (cause) { run?.check(); if (init?.signal?.aborted) throw cause; }
  }
  if (!stored?.quotations) return Response.json({ error: 'Open quotations online once to prepare this device for offline work.' }, { status: 503 });
  if (!projectId) return Response.json({ projects: stored.quotations.entries.filter(item => available(stored, item) && item.data.quotationAccess === 'prices').map(item => ({ id: item.projectId, ...item.data.project })) });
  return available(stored, entry) ? Response.json(pendingData(stored.quotations, entry)) : Response.json({ error: 'This quotation is not downloaded or is no longer available on this device.' }, { status: 404 });
}

function shape(data: OfflineQuotationData) {
  const copy = data.flow?.quotation;
  if (!copy) return null;
  const omit = (object: Record<string, unknown>, keys: string[]) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
  return { ...omit(copy, ['total', 'createdAt', 'preparedBy', 'version', 'discount']),
    lines: copy.lines.map(line => ({ ...omit(line, ['total', 'system']), system: omit(line.system, ['rate', 'total', 'rateSource']) })),
    ...(copy.additionalItems ? { additionalItems: copy.additionalItems.map(item => omit(item, ['rate', 'total', 'rateSource'])) } : {}),
  };
}

function finalBody(operation: OfflineQuotationOperation): Record<string, unknown> {
  if (!operation.successor) return operation.body;
  const body = { ...operation.successor.body };
  if (body.action === 'save') {
    const first = operation.body.newOpenings as { id?: string }[] | undefined;
    const next = body.newOpenings as { id?: string }[] | undefined;
    if (first?.length) body.newOpenings = [...first, ...(next ?? []).filter(item => !first.some(previous => previous.id === item.id))];
    const oldChanges = operation.body.openingSizeChanges as { openingId?: string }[] | undefined;
    const newChanges = body.openingSizeChanges as { openingId?: string }[] | undefined;
    if (oldChanges?.length) {
      if (newChanges?.some(item => oldChanges.some(previous => previous.openingId === item.openingId))) throw new Error('Saved size edits need manual review against the latest measurements.');
      body.openingSizeChanges = [...oldChanges, ...(newChanges ?? [])];
    }
  }
  return body;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export async function reviewOfflineQuotation(projectId: string): Promise<OfflineQuotationReview> {
  if (!online()) throw new Error('Connect to the internet to review the latest quotation.');
  const run = context();
  const state = await readStoredFieldState(run.actor); run.check();
  const operation = state?.quotations?.queue.find(item => item.projectId === projectId);
  if (!operation) throw new Error('No saved quotation draft needs review.');
  const response = await fetch(`/api/sales-flow/${projectId}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) }); run.check();
  if (!response.ok) { await markFailure(run, operation, response.status, response.status === 403 || response.status === 404 ? revoked : 'Sign in online to review this quotation.'); throw new Error('The latest quotation is unavailable. Your saved draft is retained.'); }
  const latest: unknown = await response.json(); run.check();
  if (!validData(latest) || response.headers.get('X-Alumex-Actor') !== run.actor) throw new Error('Unable to load the latest quotation for this employee.');
  await cacheResponse(projectId, latest, run);
  let canRebase = canonical(shape(operation.base)) === canonical(shape(latest)) && (operation.base.quotationAccess ?? 'full') === (latest.quotationAccess ?? 'full');
  try { projectOfflineQuotation(latest, { ...finalBody(operation), revision: latest.flow?.revision ?? 0 }, run.actor); } catch { canRebase = false; }
  return { projectId, operationId: operation.id, latest: safeData(latest), localTotal: (operation.successor?.draft ?? operation.draft).flow?.quotation.total ?? 0, canRebase };
}

// Both choices retain the old request as an archive. A reviewed rebase is a new
// operation, never a rewrite of an attempted request or a forced server save.
export async function resolveOfflineQuotation(review: OfflineQuotationReview, choice: 'server' | 'rebase'): Promise<void> {
  const run = context();
  const fresh = await reviewOfflineQuotation(review.projectId); run.check();
  if (fresh.operationId !== review.operationId || canonical(fresh.latest) !== canonical(review.latest)) throw new Error('The quotation changed during review. Review the latest version again.');
  if (choice === 'rebase' && !fresh.canRebase) throw new Error('Quotation specifications changed. Keep the latest version and enter your changes again.');
  await updateFieldState(run.actor, state => {
    run.check(); if (!state?.quotations) throw new Error(changedAccount);
    const quotations = state.quotations;
    const operation = quotations.queue.find(item => item.id === review.operationId);
    if (!operation) throw new Error('The draft already synchronized. Reload the quotation.');
    const archived = [...quotations.archived, { operation, archivedAt: new Date().toISOString(), reason: choice === 'server' ? 'Kept latest server quotation after review.' : 'Rebased draft after reviewing the latest server quotation.' }];
    const queue = quotations.queue.filter(item => item.id !== operation.id);
    if (choice === 'rebase') {
      const body = { ...finalBody(operation), revision: fresh.latest.flow?.revision ?? 0 };
      queue.push({ id: crypto.randomUUID(), userId: run.actor, projectId: operation.projectId, recordedAt: new Date().toISOString(), body, base: fresh.latest, draft: projectOfflineQuotation(fresh.latest, body, run.actor) });
    }
    return { ...state, quotations: { ...quotations, queue, archived, entries: quotations.entries.map(entry => entry.projectId === review.projectId ? { ...entry, data: fresh.latest, available: true } : entry) } };
  });
  if (choice === 'rebase') void syncOfflineQuotations().catch(() => {});
}
