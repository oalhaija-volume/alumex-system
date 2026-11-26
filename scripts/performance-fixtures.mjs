// Reproducible, sanitized browser fixtures. These never read production data.
export const performanceActor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Benchmark administrator', role: 'Admin', branch: 'Karkh' };
export const performanceProjectId = '11111111-1111-4111-8111-000000000001';
const timestamp = '2026-11-26T08:00:00Z';
const projectId = index => `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`;
function capture(seed) {
 let state = seed, result = 'data:image/png;base64,';
 const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
 for (let index = 0; index < 65536; index++) { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; result += alphabet[state >>> 26]; }
 return result;
}
export function performanceFixtures() {
 const projects = Array.from({ length: 200 }, (_, index) => ({
  id: projectId(index), project_number: `PRJ-BENCH-${String(index + 1).padStart(3, '0')}`, project_name: `Benchmark project ${String(index + 1).padStart(3, '0')}`,
  client_id: `client-${index}`, client_name: `Benchmark client ${index + 1}`, address: 'Sanitized benchmark site, Baghdad', phone: '07700000000',
  branch: 'Karkh', governorate: null, building_type: 'villa_house', created_by: performanceActor.id, registeredBy: performanceActor.name,
  original_creator_role: 'Admin', assigned_outdoor_sales_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', assignedOutdoorSales: 'Benchmark Outdoor Sales',
  follow_up_owner_id: performanceActor.id, followUpOwner: performanceActor.name, structure_readiness: index % 3 ? 'ready' : 'not_ready',
  sales_status: index % 3 ? 'contract_generated' : 'new_lead', status: 'Contract', archived_at: null,
  created_at: timestamp, updated_at: timestamp, next_follow_up_at: '2026-12-15T08:00:00Z', project_notes: 'Sanitized previous client contact note.',
 }));
 const workspace = { actor: performanceActor, projects, indoorSales: [{ ...performanceActor }],
  outdoorSales: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Benchmark Outdoor Sales', branch: 'Karkh', outdoorRotationStartBranch: 'Karkh' }],
  openings: [], queue: [], syncedAt: null };
 const histories = Object.fromEntries(projects.map(project => [project.id, { project,
  entries: Array.from({ length: 30 }, (_, index) => ({ id: `${project.id}-${index}`, action: 'follow-up', note: `Sanitized follow-up note ${index + 1}. The client requested a progress update.`,
   recordedAt: timestamp, recordedBy: performanceActor.name, followUpType: 'call', followUpOwner: performanceActor.name, nextFollowUp: '2026-12-15T08:00:00Z' })),
 }]));
 const openings = Array.from({ length: 30 }, (_, index) => ({ id: `cccccccc-cccc-4ccc-8ccc-${String(index + 1).padStart(12, '0')}`, project_id: performanceProjectId,
  opening_code: `BENCH-${index}`, floor: 'Ground', room: 'Office', width: 117, height: 203, quantity: 1, opening_type: 'Window', opening_direction: 'Hinged',
  has_arch: false, has_roller_shutter: false, work_area: 'internal', facade_number: null, solid_panel_height: 0, fixed_height: 0,
  notes: 'Sanitized opening note', created_by: performanceActor.id, created_at: timestamp, updated_at: timestamp, recordedBy: performanceActor.name,
  curtain_wall_capture: { note: 'Sanitized shape note', photo: capture(index * 2 + 1) }, has_curtain_wall_capture: true,
  skylight_capture: { version: 1, sections: [{ label: 'A', width: 117, length: 203 }], photo: capture(index * 2 + 2), drawing: null }, has_skylight_capture: true,
 }));
 const quotation = { version: 4, createdAt: timestamp, preparedBy: performanceActor.id, currency: 'IQD', total: 21375900,
  lines: openings.map(opening => ({ opening: { id: opening.id, floor: opening.floor, room: opening.room, width: opening.width, height: opening.height, quantity: 1,
   opening_type: 'Window', opening_direction: 'Hinged' }, area: 2.3751, system: { id: 'hinged', name: 'Hinged Window', unit: 'sqm', quantity: 2.3751, rate: 300000, total: 712530 }, glass: null, extras: [], total: 712530 })) };
 const contract = { number: 'CT-BENCHMARK', createdAt: timestamp, createdBy: performanceActor.id, template: 'residential', branch: 'Karkh', quotation,
  client: { name: 'Benchmark client 1', mobile: '07700000000', client_type: 'individual' }, project: { name: projects[0].project_name, number: projects[0].project_number, address: projects[0].address, branch: 'Karkh' },
  terms: [{ title: 'Saved benchmark terms', text: 'Sanitized fixed contract terms. Payment and delivery details remain frozen.' }] };
 const overview = { actor: performanceActor, project: projects[0], client: { id: projects[0].client_id, name: 'Benchmark client 1', mobile: '07700000000', alternate_mobile: null,
  email: 'benchmark@example.invalid', address: 'Sanitized benchmark site', province: 'Baghdad', city: 'Baghdad', notes: 'Sanitized benchmark record', client_type: 'individual', company_name: null, whatsapp: null, preferred_language: 'en' },
  contacts: [], openings, flow: { project_id: performanceProjectId, revision: 8, stage: 'contract', quotation, contract, signed_at: null, evidence: null, accepted_at: null, accepted_by: null },
  history: Array.from({ length: 12 }, (_, index) => ({ version: index + 1, quotation: { ...quotation, version: index + 1 }, contract, previous_stage: 'contract', superseded_at: timestamp })),
  documentRevisions: Array.from({ length: 3 }, (_, index) => ({ id: `dddddddd-dddd-4ddd-8ddd-${String(index + 1).padStart(12, '0')}`, project_id: performanceProjectId,
   document_revision: index + 1, source_workflow_revision: 8, source_signed_at: null, format_version: 'billable-opening-schedule-v1', revision_reason: 'opening_schedule', superseded_at: null,
   status: 'pending_approval', revision: 1, contract, created_by: performanceActor.id, created_at: timestamp, approved_by: null, approved_at: null, signed_at: null, evidence: null })),
  followUps: histories[performanceProjectId], measurementReports: [], sizeHistory: [], warnings: [], signedCopyAvailable: false };
 return { workspace, overview, histories };
}

export function performanceApiResponse(url, fixture) {
 if (url.pathname === '/api/workspace' || url.pathname === '/api/dashboard') {
  if (url.searchParams.has('projectId')) return { ...fixture.workspace, projects: fixture.workspace.projects.filter(project => project.id === url.searchParams.get('projectId')) };
  if (url.searchParams.get('view') === 'dashboard') return { ...fixture.workspace, summary: true,
   projects: fixture.workspace.projects.map(({ project_notes, ...project }) => project) };
  if (url.searchParams.get('view') !== 'projects') return fixture.workspace;
  const query = (url.searchParams.get('q') ?? '').toLowerCase();
  const rows = fixture.workspace.projects.filter(project => !query || project.project_name.toLowerCase().includes(query));
  const pageSize = Math.min(100, Number(url.searchParams.get('pageSize') ?? 25));
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, Number(url.searchParams.get('page') ?? 1)));
  return { ...fixture.workspace, projects: rows.slice((page - 1) * pageSize, page * pageSize),
   pagination: { page, pageSize, total: rows.length, totalProjects: fixture.workspace.projects.length, totalPages },
   outdoorOptions: fixture.workspace.outdoorSales.map(person => ({ ...person, count: rows.length })) };
 }
 const followUp = url.pathname.match(/^\/api\/projects\/([^/]+)\/follow-ups$/);
 if (followUp) return fixture.histories[followUp[1]];
 if (url.pathname === `/api/projects/${performanceProjectId}`) {
  const section = url.searchParams.get('section');
  if (!section) return fixture.overview;
  const empty = { ...fixture.overview, section, openings: [], flow: null, history: [], followUps: { project: fixture.overview.followUps.project, entries: [] }, measurementReports: [], sizeHistory: [], documentRevisions: [] };
  if (section === 'measurements') return { ...empty, openings: fixture.overview.openings.map(opening => ({ ...opening, curtain_wall_capture: null, skylight_capture: null })) };
  if (section === 'follow-ups') return { ...empty, followUps: fixture.overview.followUps };
  if (section === 'quotation') return { ...empty, flow: fixture.overview.flow, history: fixture.overview.history };
  if (section === 'contract') return { ...empty, flow: fixture.overview.flow, history: fixture.overview.history, documentRevisions: fixture.overview.documentRevisions };
  return empty;
 }
 if (url.pathname === '/api/outdoor-sales-coverage') return { asOf: '2026-11-26T08:00:00Z', staff: [] };
 if (url.pathname === '/api/shared-quotations') return { actor: performanceActor, projects: [] };
 return undefined;
}
