import test from 'node:test';
import assert from 'node:assert/strict';
import { projectCreationMonth, projectRegistrationOptions, matchesProjectRegistration } from '../src/lib/dashboard/projectRegistrationFilters.ts';

test('creation months use Baghdad time and distinguish years', () => {
  assert.equal(projectCreationMonth('2026-09-30T20:59:59Z'), '2026-09');
  assert.equal(projectCreationMonth('2026-09-30T21:00:00Z'), '2026-10');
  assert.equal(projectCreationMonth('2025-12-31T21:00:00Z'), '2026-01');
  assert.equal(projectCreationMonth('2025-10-10T12:00:00Z'), '2025-10');
  for (const value of [undefined, null, '', 'invalid']) assert.equal(projectCreationMonth(value), '');
});

test('month and creator filters intersect using employee identity, not assignment or display name', () => {
  const projects = [
    { created_at: '2026-10-02T10:00:00Z', created_by: 'one', registeredBy: 'Same name', assigned_outdoor_sales_id: 'two' },
    { created_at: '2026-09-02T10:00:00Z', created_by: 'one', registeredBy: 'Same name' },
    { created_at: '2026-10-02T10:00:00Z', created_by: 'two', registeredBy: 'Same name' },
    { created_at: '2025-10-02T10:00:00Z', created_by: 'two', registeredBy: 'Same name' },
    { created_at: null, created_by: null },
  ];
  const filter = (month, creator) => projects.filter(p => matchesProjectRegistration(p, month, creator));
  assert.deepEqual(filter('', ''), projects);
  assert.deepEqual(filter('2026-10', ''), [projects[0], projects[2]]);
  assert.deepEqual(filter('', 'one'), [projects[0], projects[1]]);
  assert.deepEqual(filter('2026-10', 'one'), [projects[0]]);
  assert.deepEqual(filter('2025-10', 'one'), []);
  const options = projectRegistrationOptions(projects);
  assert.deepEqual(options.months, ['2026-10', '2026-09', '2025-10']);
  assert.deepEqual(options.creators.map(c => c.id), ['one', 'two']);
});
