import test from 'node:test';
import assert from 'node:assert/strict';
import { outdoorProjectOptions, projectOutdoorSalesOrigin, sortProjectsByRegistration } from '../src/lib/dashboard/outdoorProjectFilters.ts';

const directory = [{ id: 'ali', name: 'Ali' }, { id: 'rana', name: 'Rana' }];

test('original outdoor sales credit takes priority over registration and measurements', () => {
  const legacy = {
    legacy_outdoor_sales_id: 'ali', legacyOutdoorSalesOwner: 'Ali',
    created_by: 'indoor', registeredBy: 'Indoor employee', original_creator_role: 'Indoor Sales',
    assigned_outdoor_sales_id: 'rana', assignedOutdoorSales: 'Rana',
  };
  assert.deepEqual(projectOutdoorSalesOrigin(legacy, directory), { id: 'ali', name: 'Ali' });
  assert.deepEqual(projectOutdoorSalesOrigin({ ...legacy, created_by: 'rana', original_creator_role: 'Outdoor Sales' }, directory), { id: 'ali', name: 'Ali' });
  assert.deepEqual(projectOutdoorSalesOrigin({ legacy_outdoor_sales_id: 'ali' }, directory), { id: 'ali', name: 'Ali' });
  assert.deepEqual(projectOutdoorSalesOrigin({ legacy_outdoor_sales_id: 'historical' }), { id: 'historical', name: 'Employee' });
  assert.equal(projectOutdoorSalesOrigin({ created_by: 'indoor', original_creator_role: 'Indoor Sales', assigned_outdoor_sales_id: 'ali' }, directory), null);
  assert.equal(projectOutdoorSalesOrigin({ assigned_outdoor_sales_id: 'ali' }, directory), null);
});

test('creator role preserves historical attribution and directory fallback only handles missing roles', () => {
  const historical = { created_by: 'inactive', registeredBy: 'Former employee', original_creator_role: 'Outdoor Sales' };
  assert.deepEqual(projectOutdoorSalesOrigin(historical, directory), { id: 'inactive', name: 'Former employee' });
  assert.deepEqual(projectOutdoorSalesOrigin({ created_by: 'ali' }, directory), { id: 'ali', name: 'Ali' });
  assert.deepEqual(projectOutdoorSalesOrigin({ created_by: 'ali', original_creator_role: null }, directory), { id: 'ali', name: 'Ali' });
  assert.equal(projectOutdoorSalesOrigin({ created_by: 'unknown' }, directory), null);
  for (const role of ['Indoor Sales', 'Sales Manager', 'Admin', 'CEO']) {
    assert.equal(projectOutdoorSalesOrigin({ created_by: 'ali', original_creator_role: role }, directory), null);
  }
  assert.equal(projectOutdoorSalesOrigin({ original_creator_role: 'Outdoor Sales' }, directory), null);
});

test('options count original salespeople, include inactive staff, and keep identical names distinct', () => {
  const projects = [
    { created_by: 'ali', registeredBy: 'Ali', original_creator_role: 'Outdoor Sales' },
    { created_by: 'indoor', original_creator_role: 'Indoor Sales', legacy_outdoor_sales_id: 'ali', legacyOutdoorSalesOwner: 'Ali' },
    { created_by: 'indoor', original_creator_role: 'Indoor Sales', assigned_outdoor_sales_id: 'ali' },
    { created_by: 'former-b', registeredBy: 'Same name', original_creator_role: 'Outdoor Sales' },
    { legacy_outdoor_sales_id: 'former-a', legacyOutdoorSalesOwner: 'Same name' },
    { created_by: 'rana', original_creator_role: 'Outdoor Sales' },
  ];
  const original = structuredClone(projects);
  assert.deepEqual(outdoorProjectOptions(projects, directory), [
    { id: 'ali', name: 'Ali', count: 2 },
    { id: 'rana', name: 'Rana', count: 1 },
    { id: 'former-a', name: 'Same name', count: 1 },
    { id: 'former-b', name: 'Same name', count: 1 },
  ]);
  assert.deepEqual(projects, original);
  assert.deepEqual(outdoorProjectOptions([], directory), []);
});

test('a resolved historical name replaces a missing-name placeholder', () => {
  assert.deepEqual(outdoorProjectOptions([
    { legacy_outdoor_sales_id: 'former' },
    { legacy_outdoor_sales_id: 'former', legacyOutdoorSalesOwner: 'Former employee' },
  ]), [{ id: 'former', name: 'Former employee', count: 2 }]);
});

test('registration sorting uses timestamps, keeps equal dates stable, and leaves invalid dates last', () => {
  const projects = [
    { id: 'invalid', created_at: 'invalid' },
    { id: 'newer', created_at: '2026-11-02T09:00:00Z' },
    { id: 'oldest', created_at: '2025-11-01T09:00:00Z' },
    { id: 'same-first', created_at: '2026-11-02T11:00:00+03:00' },
    { id: 'same-second', created_at: '2026-11-02T08:00:00Z' },
    { id: 'missing' },
    { id: 'null', created_at: null },
  ];
  const original = [...projects];
  assert.deepEqual(sortProjectsByRegistration(projects, 'newest').map(project => project.id), ['newer', 'same-first', 'same-second', 'oldest', 'invalid', 'missing', 'null']);
  assert.deepEqual(sortProjectsByRegistration(projects, 'oldest').map(project => project.id), ['oldest', 'same-first', 'same-second', 'newer', 'invalid', 'missing', 'null']);
  assert.deepEqual(projects, original);
  assert.deepEqual(sortProjectsByRegistration([], 'newest'), []);
});
