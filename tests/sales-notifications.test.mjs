import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', output)(name => { assert.ok(name in dependencies, name); return dependencies[name]; }, exports);
  return exports;
}

const delivery = load('../src/lib/notifications/delivery.ts');
const sound = load('../src/lib/notifications/sound.ts');

test('new notification delivery excludes read and previously delivered events, including after storage reload', () => {
  const seen = delivery.parseDeliveredIds('["seen",42]');
  const items = [{ id: 'seen', read_at: null }, { id: 'read', read_at: 'now' }, { id: 'fresh', read_at: null }];
  assert.deepEqual(delivery.newNotifications(items, seen).map(item => item.id), ['fresh']);
  seen.add('fresh');
  assert.deepEqual(delivery.newNotifications(items, delivery.parseDeliveredIds(JSON.stringify([...seen]))), []);
  assert.equal(delivery.parseDeliveredIds('broken').size, 0);
  assert.equal(delivery.parseDeliveredIds('{"id":"untrusted"}').size, 0);
});

test('notification links keep the destination local and repair legacy routes', () => {
  for (const path of ['https://evil.example/', '//evil.example', '/\\evil.example', '/\n/evil.example', null]) {
    assert.equal(delivery.notificationLink({ link_path: path }, '/dashboard'), '/dashboard');
  }
  assert.equal(delivery.notificationLink({ link_path: '/crm#project-123' }), '/mini-crm#project-123');
  assert.equal(delivery.notificationLink({ link_path: '/site-measurements/123' }), '/initial-measurements/123');
  assert.equal(delivery.notificationLink({ link_path: '/initial-measurements/123' }), '/initial-measurements/123');
});

test('the chime plays two descending soft notes for half a second and releases audio nodes', () => {
  const oscillators = [];
  const gains = [];
  const context = {
    state: 'running', currentTime: 10, destination: {},
    createOscillator() {
      const node = { frequency: {}, connect() {}, disconnect() { this.disconnected = true; }, start(at) { this.started = at; }, stop(at) { this.stopped = at; } };
      oscillators.push(node); return node;
    },
    createGain() {
      const node = { gain: { setValueAtTime() {}, linearRampToValueAtTime(volume) { node.volume = volume; }, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() { this.disconnected = true; } };
      gains.push(node); return node;
    },
  };
  assert.equal(sound.playNotificationChime(context), true);
  assert.deepEqual(oscillators.map(node => node.frequency.value), [880, 660]);
  assert.ok(oscillators[1].stopped - oscillators[0].started < 0.51);
  assert.ok(gains.every(node => node.volume <= 0.1));
  oscillators.forEach(node => node.onended());
  assert.ok(oscillators.every(node => node.disconnected));
  assert.ok(gains.every(node => node.disconnected));
  assert.equal(sound.playNotificationChime({ state: 'suspended' }), false);
});

const employeeId = '11111111-1111-4111-8111-111111111111';
const notificationId = '22222222-2222-4222-8222-222222222222';
function routeHarness(auth = { ok: true, user: { id: employeeId }, role: 'Indoor Sales' }) {
  const calls = [];
  let connections = 0;
  const route = load('../src/app/api/notifications/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200, headers: options?.headers }) } },
    '@/lib/auth/adminServer': { requireRole: async () => auth },
    '@/lib/workflow/access': { salesRoles: ['Indoor Sales', 'Outdoor Sales'] },
    '@/lib/supabase/server': { createClient: async () => {
      connections++;
      return {
        rpc: async (...args) => { calls.push(['rpc', ...args]); return { error: null }; },
        from(table) {
          const operations = [['from', table]];
          const query = { then(resolve) { calls.push(operations); resolve({ data: [], count: 3, error: null }); } };
          for (const method of ['select', 'update', 'eq', 'is', 'order', 'limit']) query[method] = (...args) => { operations.push([method, ...args]); return query; };
          return query;
        },
      };
    } },
  });
  return { route, calls, connections: () => connections };
}

test('notifications API rejects unauthenticated reads and writes before database access', async () => {
  const { route, connections } = routeHarness({ ok: false, status: 401, error: 'Authentication is required.' });
  assert.equal((await route.GET()).status, 401);
  assert.equal((await route.PATCH({ json: async () => ({ all: true }) })).status, 401);
  assert.equal(connections(), 0);
});

test('notification reads deliver only authenticated due reminders and scope both queries to the current recipient', async () => {
  const { route, calls } = routeHarness();
  const response = await route.GET();
  assert.equal(response.status, 200);
  assert.equal(response.body.userId, employeeId);
  assert.equal(response.body.unreadCount, 3);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.deepEqual(calls[0], ['rpc', 'deliver_due_follow_up_notifications']);
  for (const query of calls.slice(1)) assert.ok(query.some(operation => JSON.stringify(operation) === JSON.stringify(['eq', 'recipient_id', employeeId])));
});

test('mark-read validates requests and cannot update another employee notification', async () => {
  const { route, calls, connections } = routeHarness();
  for (const body of [null, {}, { notificationId: 'bad' }, { notificationId, all: true }, { all: true, notificationId: 'bad' }]) {
    assert.equal((await route.PATCH({ json: async () => body })).status, 400);
  }
  assert.equal(connections(), 0);
  const response = await route.PATCH({ json: async () => ({ notificationId, recipientId: 'someone-else' }) });
  assert.equal(response.status, 200);
  const query = calls[0];
  assert.ok(query.some(operation => JSON.stringify(operation) === JSON.stringify(['eq', 'recipient_id', employeeId])));
  assert.ok(query.some(operation => JSON.stringify(operation) === JSON.stringify(['eq', 'id', notificationId])));
  assert.deepEqual(Object.keys(query.find(operation => operation[0] === 'update')[1]), ['read_at']);
});
