import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../src/app/', import.meta.url);
function files(dir, prefix='') {
 return readdirSync(dir,{withFileTypes:true}).flatMap(entry => entry.isDirectory()
  ? files(new URL(`${entry.name}/`,dir),`${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]);
}
test('only approved rebuilt workflow pages exist', () => {
 assert.deepEqual(files(root).filter(p=>p.endsWith('/page.tsx') || p==='page.tsx').sort(),
  ['catalog/page.tsx','contract/[projectId]/page.tsx','hr/page.tsx','initial-measurements/[projectId]/page.tsx','intake/page.tsx','login/page.tsx','mini-crm/page.tsx','mobile-required/page.tsx','operations/page.tsx','page.tsx','projects/page.tsx','quotation/[projectId]/page.tsx','unauthorized/page.tsx']);
});
test('only the approved rebuilt APIs exist; legacy workflow endpoints stay absent', () => {
 assert.deepEqual(files(new URL('api/',root)).filter(p=>p.endsWith('route.ts')).sort(),
  ['admin/users/route.ts','auth/bootstrap-profile/route.ts','auth/resolve-login/route.ts','catalog/route.ts','initial-measurements/[projectId]/route.ts','location-search/route.ts','operations/route.ts','sales-flow/[projectId]/route.ts','sales-intake/route.ts','workspace/route.ts']);
});
