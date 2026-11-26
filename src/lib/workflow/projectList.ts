import type { SalesWorkspaceData } from '@/lib/offline/types';
import { matchesProjectSearch } from '@/lib/dashboard/projectSearch';
import { projectOutdoorSalesOrigin, type OutdoorSalesPerson } from '@/lib/dashboard/outdoorProjectFilters';

export const projectListPageSize = 25;
export type ProjectListQuery = { page: number; pageSize: number; q: string; salesperson: string; order: 'newest' | 'oldest'; focus?: string };
export type ProjectListPagination = { page: number; pageSize: number; total: number; totalProjects: number; totalPages: number };
export type ProjectListData = SalesWorkspaceData & { pagination?: ProjectListPagination; outdoorOptions?: (OutdoorSalesPerson & { count: number })[] };
export const projectIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseProjectListQuery(params: URLSearchParams): ProjectListQuery {
 const integer = (key: string, fallback: number, max: number) => {
  const value = params.get(key);
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) throw new Error('Invalid project page.');
  return Number(value);
 };
 const salesperson = params.get('salesperson') ?? '';
 if (salesperson && !projectIdPattern.test(salesperson)) throw new Error('Invalid salesperson.');
 const focus = params.get('focus') ?? '';
 if (focus && !projectIdPattern.test(focus)) throw new Error('Invalid project.');
 const order = params.get('order') ?? 'newest';
 if (order !== 'newest' && order !== 'oldest') throw new Error('Invalid registration date order.');
 const q = (params.get('q') ?? '').trim();
 if (q.length > 200) throw new Error('Search must be 200 characters or fewer.');
 return { page: integer('page', 1, 1000000), pageSize: integer('pageSize', projectListPageSize, 100), q, salesperson, order, ...(focus ? { focus } : {}) };
}

export function projectListURL(query: ProjectListQuery) {
 const params = new URLSearchParams({ view: 'projects', page: String(query.page), pageSize: String(query.pageSize), order: query.order });
 if (query.q) params.set('q', query.q);
 if (query.salesperson) params.set('salesperson', query.salesperson);
 if (query.focus) params.set('focus', query.focus);
 return `/api/workspace?${params}`;
}

type SearchRow = Parameters<typeof matchesProjectSearch>[0] & Parameters<typeof projectOutdoorSalesOrigin>[0] & { id: string; created_at: string };
export function selectProjectListPage<T extends SearchRow>(rows: T[], query: ProjectListQuery, directory: OutdoorSalesPerson[]) {
 const filtered = rows.filter(row => matchesProjectSearch(row, query.q) && (!query.salesperson || projectOutdoorSalesOrigin(row, directory)?.id === query.salesperson));
 filtered.sort((a, b) => {
  const compared = a.created_at.localeCompare(b.created_at);
  return (query.order === 'oldest' ? compared : -compared) || a.id.localeCompare(b.id);
 });
 const totalPages = Math.max(1, Math.ceil(filtered.length / query.pageSize));
 const focusIndex = query.focus ? filtered.findIndex(row => row.id === query.focus) : -1;
 const page = focusIndex >= 0 ? Math.floor(focusIndex / query.pageSize) + 1 : Math.min(query.page, totalPages);
 return { ids: filtered.slice((page - 1) * query.pageSize, page * query.pageSize).map(row => row.id),
  pagination: { page, pageSize: query.pageSize, total: filtered.length, totalProjects: rows.length, totalPages } };
}
