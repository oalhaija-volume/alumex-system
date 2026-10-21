import assert from 'node:assert/strict';
import test from 'node:test';
import {isPhoneRequest, usesMobileWorkspace, isMobileWorkspaceRoute} from '../src/lib/auth/mobileAccess.ts';

for (const [name, agent, allowed] of [
  ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1', true],
  ['Android phone', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0 Mobile Safari/537.36', true],
  ['Windows desktop', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36', false],
  ['Mac desktop', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15', false],
  ['iPad', 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1', false],
  ['Android tablet', 'Mozilla/5.0 (Linux; Android 14; Tablet) Chrome/130.0 Safari/537.36', false],
  ['missing device', '', false],
]) {
  test(`${name} uses ${allowed ? 'focused mobile' : 'broader desktop'} Outdoor Sales`, () => {
    const headers = new Headers({'user-agent':agent});
    assert.equal(isPhoneRequest(headers), allowed);
    assert.equal(usesMobileWorkspace('Outdoor Sales',headers), allowed);
    assert.equal(usesMobileWorkspace('Indoor Sales',headers), false);
    assert.equal(usesMobileWorkspace('Admin',headers), false);
  });
}

test('mobile client hints support phone requests without affecting other roles', () => {
  assert.equal(isPhoneRequest(new Headers({'sec-ch-ua-mobile':'?1'})), true);
  assert.equal(isPhoneRequest(new Headers({'sec-ch-ua-mobile':'?0'})), false);
});

 test('phone workspace keeps assignments and intake while excluding commercial routes', () => {
   for (const path of ['/dashboard','/intake','/project-log','/initial-measurements/11111111-1111-4111-8111-111111111111']) assert.equal(isMobileWorkspaceRoute(path), true);
   for (const path of ['/projects','/mini-crm','/quotation/11111111-1111-4111-8111-111111111111','/contract/11111111-1111-4111-8111-111111111111']) assert.equal(isMobileWorkspaceRoute(path), false);
 });
