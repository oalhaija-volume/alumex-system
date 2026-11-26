import type { OfflineQuotationData, OfflineQuotationState } from './quotationTypes';

type ProjectIdentity = { id: string; project_name: string; client_name?: string; updated_at?: string };

// Identity metadata can refresh independently of a queued pricing operation.
// Its request, server baseline, saved charges and workflow revision stay put.
export function quotationIdentity(data: OfflineQuotationData, identity: Omit<ProjectIdentity, 'id'>): OfflineQuotationData {
 const known = Date.parse(data.project.updated_at ?? ''), incoming = Date.parse(identity.updated_at ?? '');
 if (Number.isFinite(known) && Number.isFinite(incoming) && known > incoming) return data;
 return { ...data, client: { ...data.client, ...(identity.client_name === undefined ? {} : { name: identity.client_name }) },
  project: { ...data.project, project_name: identity.project_name, ...(identity.updated_at === undefined ? {} : { updated_at: identity.updated_at }) } };
}

export function refreshQuotationIdentities(quotations: OfflineQuotationState | undefined, projects: ProjectIdentity[]) {
 if (!quotations) return quotations;
 const identities = new Map(projects.map(project => [project.id, project]));
 return { ...quotations, entries: quotations.entries.map(entry => {
  const identity = identities.get(entry.projectId);
  return identity ? { ...entry, data: quotationIdentity(entry.data, identity) } : entry;
 }) };
}

export function retainQuotationIdentity(incoming: OfflineQuotationData, previous?: OfflineQuotationData) {
 const known = Date.parse(previous?.project.updated_at ?? ''), received = Date.parse(incoming.project.updated_at ?? '');
 return previous && Number.isFinite(known) && (!Number.isFinite(received) || known > received)
  ? quotationIdentity(incoming, { project_name: previous.project.project_name, client_name: previous.client.name, updated_at: previous.project.updated_at }) : incoming;
}
