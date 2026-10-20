import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function modules() {
  const loaded = new Map();
  function load(url) {
    if (loaded.has(url.href)) return loaded.get(url.href);
    const exports = {};
    loaded.set(url.href, exports);
    const js = ts.transpileModule(readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('require', 'exports', js)(name => load(name.startsWith('@/')
      ? new URL(`../src/${name.slice(2)}.ts`, import.meta.url)
      : new URL(`${name}.ts`, url)), exports);
    return exports;
  }
  return name => load(new URL(`../src/lib/offline/${name}.ts`, import.meta.url));
}

const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Indoor employee', role: 'Indoor Sales', branch: 'Karkh' };
const projects = ['Karkh', 'Rasafa', null].map((branch, index) => ({
  id: `project-${index}`, branch, project_number: `PRJ-${index}`, project_name: `${branch ?? 'Unassigned'} client`,
  created_by: actor.id, assigned_outdoor_sales_id: actor.id, structure_readiness: 'ready', sales_status: 'new_lead',
  updated_at: '2026-10-19T00:00:00Z', pending: true,
}));
const openings = projects.map(project => ({
  id: `opening-${project.id}`, projectId: project.id, floor: 'Ground', room: 'Kitchen', width: 100, height: 200,
  structuralType: 'Window', openingType: 'Sliding', skylight: { photo: `saved-photo-${project.id}` },
}));
const queue = projects.map(project => ({
  id: `change-${project.id}`, userId: actor.id, projectId: project.id, action: 'reopen',
  payload: { note: `saved-note-${project.id}` }, recordedAt: '2026-10-19T00:00:00Z',
}));
const measurementReports = projects.map(project => ({ id: `report-${project.id}`, project_id: project.id, photo: `photo-${project.id}`, note: 'Saved report' }));
const followUpHistories = Object.fromEntries(projects.map(project => [project.id, { entries: [{ note: `history-${project.id}` }] }]));
const archivedProjects = projects.map(project => ({
  projectId: `archive-${project.id}`, project: { ...project, id: `archive-${project.id}` },
  changes: [{ ...queue.find(change => change.projectId === project.id), projectId: `archive-${project.id}` }],
  openings: [], measurementReports: [], archivedAt: '2026-10-19T00:00:00Z',
}));

function setup(overrides = {}) {
  const accounts = new Map([[actor.id, structuredClone({
    actor, projects, openings, queue, measurementReports, followUpHistories, archivedProjects,
    indoorSales: [actor], outdoorSales: [], syncedAt: null, ...overrides,
  })]]);
  const settings = new Map([['alumex-field-active', actor.id]]);
  globalThis.localStorage = {
    getItem: key => settings.get(key) ?? null,
    setItem: (key, value) => settings.set(key, value),
    removeItem: key => settings.delete(key),
  };
  globalThis.window = { location: { pathname: '/offline' }, dispatchEvent() {} };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, value: { onLine: false, userAgent: 'iPhone', maxTouchPoints: 1 },
  });
  // Exercise the real store boundaries with a small asynchronous IndexedDB adapter.
  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          close() {},
          transaction() {
            let aborted = false;
            const tx = {
              abort() { aborted = true; tx.onabort?.(); },
              objectStore() {
                return {
                  get(id) {
                    const read = {};
                    queueMicrotask(() => {
                      read.result = structuredClone(accounts.get(id));
                      read.onsuccess?.();
                      queueMicrotask(() => { if (!aborted) tx.oncomplete?.(); });
                    });
                    return read;
                  },
                  put(state, id) { accounts.set(id, structuredClone(state)); },
                };
              },
            };
            return tx;
          },
        };
        request.onsuccess?.();
      });
      return request;
    },
  };
  const load = modules();
  return { client: load('client'), store: load('store'), get raw() { return accounts.get(actor.id); } };
}

for (const branch of ['Karkh', 'Rasafa']) {
  test(`${branch} store reads expose only matching projects, saved edits, archives and associated media/history`, async () => {
    const x = setup({ actor: { ...actor, branch } });
    const before = structuredClone(x.raw);
    const view = await x.store.readFieldState();
    const expected = projects.find(project => project.branch === branch);
    assert.deepEqual(view.projects.map(project => project.id), [expected.id]);
    assert.deepEqual(view.queue.map(change => change.projectId), [expected.id]);
    assert.deepEqual(view.openings.map(opening => opening.projectId), [expected.id]);
    assert.deepEqual(view.measurementReports.map(report => report.project_id), [expected.id]);
    assert.deepEqual(Object.keys(view.followUpHistories), [expected.id]);
    assert.deepEqual(view.archivedProjects.map(archive => archive.project.branch), [branch]);
    assert.deepEqual((await x.client.prepareOffline()).projects, view.projects);
    assert.deepEqual(x.raw, before, 'Filtering must never remove retained work');
  });
}

test('missing or invalid Indoor Sales branches fail closed, including old snapshots with unmarked projects', async () => {
  for (const branch of [null, undefined, '', 'karkh', 'Other']) {
    const x = setup({ actor: { ...actor, branch } });
    const view = await x.store.readFieldState();
    for (const key of ['projects', 'queue', 'openings', 'measurementReports', 'archivedProjects']) assert.deepEqual(view[key], []);
    assert.deepEqual(view.followUpHistories, {});
    assert.equal(x.raw.queue.length, 3);
    await assert.rejects(x.client.saveFieldChange('reopen', projects[0].id, {}), /not available/);
  }
});

test('other roles preserve existing cached access across both branches', async () => {
  for (const role of ['Outdoor Sales', 'Sales Manager', 'Admin', 'General Manager', 'HR']) {
    const x = setup({ actor: { ...actor, role, branch: null } });
    assert.deepEqual(await x.store.readFieldState(), x.raw);
  }
});

test('device workspace and direct project URLs cannot read or modify another branch, even for creator and assignee', async () => {
  const x = setup();
  const workspace = await (await x.client.fieldFetch('/api/workspace')).json();
  assert.deepEqual(workspace.projects.map(project => project.branch), ['Karkh']);
  const restricted = projects[1].id;
  assert.equal((await x.client.fieldFetch(`/api/initial-measurements/${restricted}`)).status, 404);
  const before = structuredClone(x.raw);
  await assert.rejects(x.client.saveFieldChange('reopen', restricted, {}), /not available/);
  await assert.rejects(x.client.retryReviewedProject(restricted, 'new-version'), /not available/);
  await assert.rejects(x.client.keepReviewedServerVersion({ project: projects[1], openings: [], measurementReports: [] }), /not available/);
  assert.deepEqual(x.raw, before);
});

test('snapshot refresh changes the branch immediately and retains inaccessible queued work and archives', async () => {
  const x = setup();
  const before = structuredClone(x.raw);
  navigator.onLine = true;
  globalThis.fetch = async () => Response.json({
    actor: { ...actor, branch: 'Rasafa' }, projects: [projects[1]], openings: [openings[1]], queue: [],
  });
  const refreshed = await x.client.prepareOffline();
  assert.equal(refreshed.actor.branch, 'Rasafa');
  assert.deepEqual(refreshed.projects.map(project => project.branch), ['Rasafa']);
  assert.deepEqual(refreshed.archivedProjects.map(archive => archive.project.branch), ['Rasafa']);
  assert.deepEqual(x.raw.queue, before.queue);
  assert.deepEqual(x.raw.openings, before.openings);
  assert.deepEqual(x.raw.archivedProjects, before.archivedProjects);
  assert.deepEqual(x.raw.measurementReports, before.measurementReports);
  assert.deepEqual(x.raw.followUpHistories, before.followUpHistories);
  navigator.onLine = false;
  assert.equal((await x.client.fieldFetch(`/api/initial-measurements/${projects[0].id}`)).status, 404);
});

test('a pending project missing from the server snapshot is hidden even if its cached branch still matches', async () => {
  const x = setup({ projects: [projects[0]], openings: [openings[0]], queue: [queue[0]] });
  navigator.onLine = true;
  globalThis.fetch = async () => Response.json({ actor, projects: [], openings: [], queue: [] });
  assert.deepEqual((await x.client.prepareOffline()).projects, []);
  assert.equal(x.raw.projects.length, 1);
  assert.equal(x.raw.queue.length, 1);
  assert.equal(x.raw.openings.length, 1);
  await assert.rejects(x.client.saveFieldChange('reopen', projects[0].id, {}), /not available/);
  globalThis.fetch = async () => Response.json({ actor, projects: [projects[0]], openings: [], queue: [] });
  assert.equal((await x.client.prepareOffline()).projects.length, 1, 'A later authorized snapshot restores retained work');
});

test('offline registrations remain visible before their first server synchronization', async () => {
  const x = setup({ projects: [projects[0]], openings: [], queue: [{ ...queue[0], action: 'register' }] });
  navigator.onLine = true;
  globalThis.fetch = async () => Response.json({ actor, projects: [], openings: [], queue: [] });
  assert.deepEqual((await x.client.prepareOffline()).projects.map(project => project.id), [projects[0].id]);
});

test('a registration rejected as inaccessible remains hidden across refreshes until the server grants access again', async () => {
  const x = setup({
    projects: [projects[0]], openings: [], queue: [{ ...queue[0], action: 'register' }],
    unavailableProjectIds: [projects[0].id],
  });
  navigator.onLine = true;
  globalThis.fetch = async () => Response.json({ actor, projects: [], openings: [], queue: [] });
  assert.deepEqual((await x.client.prepareOffline()).projects, []);
  assert.equal(x.raw.queue.length, 1);
  globalThis.fetch = async () => Response.json({ actor, projects: [projects[0]], openings: [], queue: [] });
  assert.deepEqual((await x.client.prepareOffline()).projects.map(project => project.id), [projects[0].id]);
});

test('sync applies the current employee branch before sending any saved change', async () => {
  const x = setup();
  navigator.onLine = true;
  const posted = [];
  globalThis.fetch = async (url, init) => {
    if (!init?.method) return Response.json({ actor: { ...actor, branch: 'Rasafa' } });
    const change = JSON.parse(init.body);
    posted.push(change.projectId);
    return Response.json({ project: projects.find(project => project.id === change.projectId) });
  };
  await x.client.syncFieldChanges();
  assert.deepEqual(posted, [projects[1].id]);
  assert.equal(x.raw.actor.branch, 'Rasafa');
  assert.deepEqual(x.raw.queue.map(change => change.projectId), [projects[0].id, projects[2].id]);
  assert.deepEqual((await x.store.readFieldState()).projects.map(project => project.branch), ['Rasafa']);
});

test('sync with a newly unassigned employee retains every saved change and sends none', async () => {
  const x = setup();
  const before = structuredClone(x.raw.queue);
  navigator.onLine = true;
  globalThis.fetch = async (url, init) => {
    assert.equal(init?.method, undefined);
    return Response.json({ actor: { ...actor, branch: null } });
  };
  await x.client.syncFieldChanges();
  assert.deepEqual(x.raw.queue, before);
  assert.deepEqual((await x.store.readFieldState()).projects, []);
});

test('an authenticated missing-project sync response hides stale cached work without discarding it', async () => {
  const x = setup({ projects: [projects[0]], queue: [queue[0]] });
  navigator.onLine = true;
  globalThis.fetch = async (url, init) => init?.method
    ? Response.json({ error: 'Project not found.' }, { status: 404 })
    : Response.json({ actor });
  await x.client.syncFieldChanges();
  assert.equal(x.raw.queue.length, 1);
  assert.equal(x.raw.projects.length, 1);
  assert.deepEqual((await x.store.readFieldState()).projects, []);
});

test('reviewing a project after employee branch reassignment hides previous branch data immediately', async () => {
  const x = setup();
  navigator.onLine = true;
  globalThis.fetch = async () => Response.json({ actor: { ...actor, branch: 'Rasafa' }, projects: [projects[1]], openings: [] });
  await assert.rejects(x.client.reviewServerProject(projects[0].id), /no longer available/);
  const view = await x.store.readFieldState();
  assert.equal(view.actor.branch, 'Rasafa');
  assert.deepEqual(view.projects.map(project => project.branch), ['Rasafa']);
  assert.equal(x.raw.queue.length, 3);
});

test('an online workspace read refreshes the stored employee branch and project branches without dropping pending work', async () => {
  const x = setup({ queue: [queue[1]] });
  const before = structuredClone(x.raw);
  navigator.onLine = true;
  window.location.pathname = '/projects';
  globalThis.fetch = async () => Response.json({
    actor: { ...actor, branch: 'Rasafa' },
    projects: [{ ...projects[0], branch: 'Rasafa' }, projects[1]],
  });
  assert.equal((await x.client.fieldFetch('/api/workspace')).status, 200);
  assert.equal(x.raw.actor.branch, 'Rasafa');
  assert.equal(x.raw.projects[0].branch, 'Rasafa');
  assert.deepEqual(x.raw.queue, before.queue);
  assert.deepEqual(x.raw.openings, before.openings);
  navigator.onLine = false;
  const view = await (await x.client.fieldFetch('/api/workspace')).json();
  assert.deepEqual(view.projects.map(project => project.branch), ['Rasafa', 'Rasafa']);
  assert.deepEqual((await x.store.readFieldState()).archivedProjects.map(archive => archive.project.branch), ['Rasafa']);
});

test('a successful workspace response for another account never changes the stored employee identity', async () => {
  const x = setup({ queue: [] });
  const before = structuredClone(x.raw);
  navigator.onLine = true;
  window.location.pathname = '/projects';
  globalThis.fetch = async () => Response.json({ actor: { ...actor, id: 'another-account', branch: 'Rasafa' }, projects: [projects[1]] });
  await x.client.fieldFetch('/api/workspace');
  assert.deepEqual(x.raw, before);
});

test('a direct online project 404 hides its cached data before any subsequent offline read and can recover on authorized read', async () => {
  const x = setup({ queue: [] });
  navigator.onLine = true;
  window.location.pathname = `/initial-measurements/${projects[0].id}`;
  globalThis.fetch = async () => Response.json({ error: 'Project not found.' }, { status: 404 });
  assert.equal((await x.client.fieldFetch(`/api/initial-measurements/${projects[0].id}`)).status, 404);
  navigator.onLine = false;
  assert.equal((await x.client.fieldFetch(`/api/initial-measurements/${projects[0].id}`)).status, 404);
  const hidden = await x.store.readFieldState();
  assert.deepEqual(hidden.projects, []);
  assert.deepEqual(hidden.openings, []);
  assert.deepEqual(hidden.measurementReports, []);
  assert.deepEqual(hidden.followUpHistories, {});
  assert.equal(x.raw.projects.length, 3);
  assert.equal(x.raw.openings.length, 3);
  navigator.onLine = true;
  globalThis.fetch = async () => Response.json({ project: projects[0], openings: [openings[0]] });
  assert.equal((await x.client.fieldFetch(`/api/initial-measurements/${projects[0].id}`)).status, 200);
  assert.deepEqual((await x.store.readFieldState()).projects.map(project => project.id), [projects[0].id]);
});

test('temporary online project failures retain authorized cached access', async () => {
  for (const failure of ['network', 'server']) {
    const x = setup({ queue: [] });
    const before = structuredClone(x.raw);
    navigator.onLine = true;
    window.location.pathname = `/initial-measurements/${projects[0].id}`;
    globalThis.fetch = async () => {
      if (failure === 'network') throw new Error('Network unavailable');
      return Response.json({ error: 'Temporarily unavailable' }, { status: 503 });
    };
    assert.equal((await x.client.fieldFetch(`/api/initial-measurements/${projects[0].id}`)).status, 200);
    assert.deepEqual(x.raw, before);
    assert.deepEqual((await x.store.readFieldState()).projects.map(project => project.id), [projects[0].id]);
  }
});
