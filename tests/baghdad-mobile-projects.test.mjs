import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path) {
  const code = ts.transpileModule(readFileSync(new URL(`../src/${path}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(name => load(name.slice(2)), exports);
  return exports;
}
const { loadWorkspaceProjects, loadWorkspaceRows } = load('lib/measurements/visitHistory');
const { visibleFieldState } = load('lib/offline/projectAccess');

function fixture(projects, failOffset) {
  const reads = [];
  return { reads, from(table) {
    const filters = []; let offset = 0, end = Infinity;
    return {
      select() { return this; }, order() { return this; },
      range(first, last) { offset = first; end = last + 1; return this; },
      eq(key, value) { filters.push(row => row[key] === value); return this; },
      in(key, values) { filters.push(row => values.includes(row[key])); return this; },
      or(value) {
        const clauses = value.split(',').map(clause => clause.split('.eq.'));
        filters.push(row => clauses.some(([key, expected]) => row[key] === expected)); return this;
      },
      then(resolve) {
        reads.push({ table, offset });
        if (table === 'projects' && offset === failOffset) return Promise.resolve({ data: null, error: { message: 'Page unavailable' } }).then(resolve);
        const data = (table === 'projects' ? projects : []).filter(row => filters.every(filter => filter(row))).slice(offset, end);
        return Promise.resolve({ data: [...data], error: null }).then(resolve);
      },
    };
  } };
}

const base = { created_by: 'outdoor', assigned_outdoor_sales_id: 'someone-else', created_at: '2026-11-14T10:00:00Z' };
for (const branch of ['Karkh', 'Rasafa']) test(`${branch} mobile workspace includes every own entry beyond the first database page`, async () => {
  const own = Array.from({ length: 1205 }, (_, index) => ({ ...base, id: `own-${index}`, branch: ['Karkh', 'Rasafa', 'Governorates'][index % 3], governorate: index % 3 === 2 ? 'البصرة' : null }));
  const privateRows = [
    { ...base, id: 'najaf', branch: 'Najaf' },
    { ...base, id: 'retired-najaf', branch: 'Governorates', governorate: ' النجف ' },
    { ...base, id: 'unrelated', branch: 'Karkh', created_by: 'someone-else' },
  ];
  const actor = { id: 'outdoor', role: 'Outdoor Sales', branch };
  const admin = fixture([...own, ...privateRows]);
  const result = await loadWorkspaceProjects(admin, actor);
  assert.equal(result.error, null);
  assert.equal(result.data.length, own.length);
  assert.deepEqual(new Set(result.data.map(project => project.id)), new Set(own.map(project => project.id)));
  assert.deepEqual(admin.reads.filter(read => read.table === 'projects').map(read => read.offset), [0, 1000]);
  const state = { actor, projects: result.data, queue: [], openings: [], syncedAt: null };
  assert.equal(visibleFieldState(state).projects.length, own.length);
});

test('a later project-page error does not return a silently incomplete mobile workspace', async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => ({ ...base, id: `own-${index}`, branch: 'Karkh' }));
  const result = await loadWorkspaceProjects(fixture(rows, 1000), { id: 'outdoor', role: 'Outdoor Sales', branch: 'Rasafa' });
  assert.equal(result.data, null);
  assert.equal(result.error.message, 'Page unavailable');
});

test('Najaf workspace includes legacy Najaf geography while excluding Baghdad and other governorates', async () => {
  const rows = [
    { ...base, id: 'najaf', branch: 'Najaf' },
    { ...base, id: 'legacy-najaf', branch: 'Governorates', governorate: 'النجف' },
    { ...base, id: 'basra', branch: 'Governorates', governorate: 'البصرة' },
    { ...base, id: 'baghdad', branch: 'Karkh' },
  ];
  for (const role of ['Outdoor Sales', 'Indoor Sales']) {
    const result = await loadWorkspaceProjects(fixture(rows), { id: 'outdoor', role, branch: 'Najaf' });
    assert.deepEqual(result.data.map(project => project.id), ['najaf', 'legacy-najaf']);
  }
});

test('large workspace downloads batch related records and paginate a project with many openings', async () => {
  const ids = Array.from({ length: 205 }, (_, index) => `project-${index}`);
  const rows = ids.flatMap((projectId, index) => Array.from({ length: index === 0 ? 1205 : 1 }, (_, opening) => ({ id: `${projectId}-${opening}`, project_id: projectId })));
  const calls = [];
  const result = await loadWorkspaceRows([...ids, ids[0]], async (batch, offset) => {
    calls.push({ batch, offset });
    return { data: rows.filter(row => batch.includes(row.project_id)).slice(offset, offset + 1000), error: null };
  });
  assert.equal(result.error, null);
  assert.deepEqual(result.data, rows);
  assert.ok(calls.every(call => call.batch.length <= 100));
  assert.deepEqual(calls.map(call => call.offset), [0, 1000, 0, 0]);
  assert.equal(new Set(result.data.map(row => row.id)).size, rows.length);
});
