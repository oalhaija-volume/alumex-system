import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function loader(dependencies = {}) {
  const cache = new Map();
  return function load(path) {
    const url = path instanceof URL ? path : new URL(path, import.meta.url);
    if (cache.has(url.href)) return cache.get(url.href);
    const exports = {};
    cache.set(url.href, exports);
    const code = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    new Function('require', 'exports', code)(name => {
      if (name in dependencies) return dependencies[name];
      if (name.startsWith('@/')) return load(new URL(`../src/${name.slice(2)}.ts`, import.meta.url));
      if (name.startsWith('.')) return load(new URL(`${name}.ts`, url));
      throw new Error(`Unexpected dependency ${name}`);
    }, exports);
    return exports;
  };
}

const { formatWorkflowContractNumber, formatContractNumber, generateNextContractNumber } = loader()('../src/lib/contracts/numbering.ts');
const projectId = '11111111-1111-4111-8111-111111111111';
const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const quote = { version: 3, lines: [], additionalItems: [], total: 500000, currency: 'IQD', createdAt: '2026-11-21T10:00:00Z', preparedBy: 'original-employee' };

function setup({ role = 'Indoor Sales', employeeBranch = 'Karkh', projectPatch = {}, flowPatch = {}, employeeError = null } = {}) {
  const calls = [], reads = [];
  const project = { id: projectId, project_number: 'PRJ-202611-0130', project_name: 'Saved project', address: 'Saved address', branch: 'Rasafa', governorate: null, governorate_office: null, sales_status: 'quotation_approved', additional_openings_state: null, ...projectPatch };
  const flow = { project_id: projectId, revision: 4, stage: 'approved', quotation: structuredClone(quote), contract: null, evidence: null, signed_at: null, accepted_at: null, accepted_by: null, ...flowPatch };
  const before = structuredClone({ project, flow });
  const agreement = { version: 'agreement-2027', total: quote.total, fields: { clientLegalName: 'Saved client', directPhone: '', clientClassification: 'فرد' } };
  const admin = {
    from(table) {
      const read = { table, filters: [], columns: null };
      reads.push(read);
      return {
        select(columns) { read.columns = columns; return this; },
        eq(key, value) { read.filters.push([key, value]); return this; },
        maybeSingle: async () => { assert.equal(table, 'sales_workflows'); return { data: flow, error: null }; },
        single: async () => { assert.equal(table, 'profiles'); return { data: employeeError ? null : { branch: employeeBranch }, error: employeeError }; },
      };
    },
    async rpc(name, args) {
      calls.push({ name, args });
      return { data: { ...flow, revision: flow.revision + 1 }, error: null };
    },
  };
  const api = loader({
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/workflow/access': { salesProject: async () => ({ admin, auth: { role, user: { id: actorId }, profile: { branch: employeeBranch } }, project }) },
    '@/lib/contracts/uploadedTerms': {},
    '@/lib/workflow/pricing': {},
    '@/lib/workflow/quotationOpenings': {},
    '@/lib/workflow/openingSizeChanges': {},
    '@/lib/contracts/agreement2027Server': {
      loadAgreement2027Snapshot: async (_admin, id, quotation, _kind, actor) => {
        assert.equal(id, projectId); assert.deepEqual(quotation, quote); assert.equal(actor, actorId);
        return structuredClone(agreement);
      },
      agreement2027Terms: () => [{ title: 'Saved terms', text: 'Saved clause' }],
    },
  })('../src/app/api/sales-flow/[projectId]/route.ts');
  const submit = body => api.POST(new Request(`http://localhost:3003/api/sales-flow/${projectId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'contract', revision: 4, template: 'residential', ...body }),
  }), { params: Promise.resolve({ projectId }) });
  return { submit, calls, reads, flow, project, before };
}

for (const role of ['Indoor Sales', 'Sales Manager']) {
  for (const [employeeBranch, prefix] of [['Karkh', 'KH'], ['Rasafa', 'RA'], ['Najaf', 'NAJ']]) {
    test(`${role} at ${employeeBranch} receives its office prefix despite another project branch or forged request`, async () => {
      const x = setup({ role, employeeBranch, projectPatch: { branch: employeeBranch === 'Karkh' ? 'Rasafa' : 'Karkh' } });
      const response = await x.submit({ number: 'FORGED', contractNumber: 'FORGED', branch: 'Najaf', createdBy: 'forged-employee' });
      assert.equal(response.status, 200);
      assert.equal(x.calls.length, 1);
      assert.equal(x.calls[0].name, 'advance_sales_flow');
      const payload = x.calls[0].args.p_payload;
      assert.equal(payload.number, `${prefix}-PRJ-202611-0130-4`);
      assert.equal(payload.branch, employeeBranch);
      assert.equal(payload.project.branch, x.project.branch);
      assert.equal(payload.createdBy, actorId);
      assert.equal(payload.agreement2027.total, quote.total);
      assert.deepEqual(x.reads.filter(read => read.table === 'profiles'), [{ table: 'profiles', columns: 'branch', filters: [['id', actorId]] }]);
      assert.deepEqual({ project: x.project, flow: x.flow }, x.before);
    });
  }
}

for (const employeeBranch of [null, undefined, '', 'Governorates', 'karkh', 'Other']) {
  test(`employees without a supported office cannot issue a contract (${String(employeeBranch)})`, async () => {
    const x = setup({ employeeBranch: employeeBranch ?? null });
    const response = await x.submit({ branch: 'Karkh' });
    assert.equal(response.status, 400);
    assert.match(response.body.error, /assign your branch/);
    assert.deepEqual(x.calls, []);
  });
}

test('employee branch lookup failure does not issue a partial contract', async () => {
  const x = setup({ employeeError: { message: 'private database details' } });
  const response = await x.submit();
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'Unable to load your employee branch.');
  assert.deepEqual(x.calls, []);
});

for (const [projectPatch, prefix] of [
  [{ branch: 'Karkh' }, 'KH'],
  [{ branch: 'Rasafa' }, 'RA'],
  [{ branch: 'Najaf' }, 'NAJ'],
  [{ branch: 'Governorates', governorate: 'البصرة' }, 'KH'],
  [{ branch: 'Governorates', governorate: 'النجف', governorate_office: null }, 'NAJ'],
  [{ branch: 'Governorates', governorate: 'النجف', governorate_office: 'Karkh' }, 'KH'],
]) {
  test(`leadership uses the saved effective project office (${JSON.stringify(projectPatch)})`, async () => {
    const x = setup({ role: 'Admin', employeeBranch: 'Rasafa', projectPatch });
    const response = await x.submit({ number: 'FORGED', branch: 'Najaf' });
    assert.equal(response.status, 200);
    assert.equal(x.calls[0].args.p_payload.number, `${prefix}-PRJ-202611-0130-4`);
    assert.equal(x.calls[0].args.p_payload.branch, projectPatch.branch, 'Keep existing contract branch metadata');
    assert.equal(x.reads.some(read => read.table === 'profiles'), false);
  });
}

test('project numbers and quotation revisions distinguish new contract references', () => {
  const refs = [formatWorkflowContractNumber('Karkh', 'PRJ-202611-0130', 4), formatWorkflowContractNumber('Karkh', 'PRJ-202611-0130', 7), formatWorkflowContractNumber('Karkh', 'PRJ-202611-0131', 4)];
  assert.equal(new Set(refs).size, refs.length);
});

test('a persisted approved quotation at revision zero retains the existing generation behavior', () => {
  assert.equal(formatWorkflowContractNumber('Karkh', 'PRJ-202611-0130', 0), 'KH-PRJ-202611-0130-0');
});

test('signing an already generated legacy contract preserves its saved reference', async () => {
  const contract = { number: 'CT-PRJ-202611-0130-3', quotation: structuredClone(quote), terms: [] };
  const x = setup({ projectPatch: { sales_status: 'contract_generated' }, flowPatch: { stage: 'contract', contract } });
  const response = await x.submit({ action: 'sign', method: 'hard_copy', signer: 'Saved client', consent: true });
  assert.equal(response.status, 200);
  assert.deepEqual(x.flow.contract, contract);
  assert.deepEqual(x.calls[0].args.p_payload, { method: 'hard_copy', signer: 'Saved client', confirmed: true });
  assert.equal(x.reads.some(read => read.table === 'profiles'), false);
});

test('legacy number helpers remain compatible with historical monthly references', () => {
  assert.equal(formatContractNumber(2026, 11, 9), 'CT-202611-0009');
  assert.equal(generateNextContractNumber({ contractNumbers: ['CT-202611-0009'], reservedNumbers: ['CT-202611-0010'], date: new Date(2026, 10, 21) }), 'CT-202611-0011');
});
