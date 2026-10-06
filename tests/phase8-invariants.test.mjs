import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../src/app/', import.meta.url);
function files(dir, prefix='') {
 return readdirSync(dir,{withFileTypes:true}).flatMap(entry => entry.isDirectory()
  ? files(new URL(`${entry.name}/`,dir),`${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]);
}
test('only registration and authentication pages remain after the reset', () => {
 assert.deepEqual(files(root).filter(p=>p.endsWith('/page.tsx') || p==='page.tsx').sort(),
  ['initial-measurements/[projectId]/page.tsx','intake/page.tsx','login/page.tsx','mobile-required/page.tsx','page.tsx','unauthorized/page.tsx']);
});
test('legacy workflow APIs are absent, including projects, HR, CRM and measurements', () => {
 assert.deepEqual(files(new URL('api/',root)).filter(p=>p.endsWith('route.ts')).sort(),
  ['auth/bootstrap-profile/route.ts','auth/resolve-login/route.ts','initial-measurements/[projectId]/route.ts','location-search/route.ts','sales-intake/route.ts']);
});
