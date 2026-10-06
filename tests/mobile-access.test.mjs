import assert from 'node:assert/strict';
import test from 'node:test';
import {isPhoneRequest, requiresMobileWorkspace} from '../src/lib/auth/mobileAccess.ts';

for (const [name, agent, allowed] of [
  ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1', true],
  ['Android phone', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0 Mobile Safari/537.36', true],
  ['Windows desktop', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36', false],
  ['Mac desktop', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15', false],
  ['iPad', 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1', false],
  ['Android tablet', 'Mozilla/5.0 (Linux; Android 14; Tablet) Chrome/130.0 Safari/537.36', false],
  ['missing device', '', false],
]) {
  test(`${name} ${allowed ? 'can' : 'cannot'} open Outdoor Sales`, () => {
    const headers = new Headers({'user-agent':agent});
    assert.equal(isPhoneRequest(headers), allowed);
    assert.equal(requiresMobileWorkspace('Outdoor Sales',headers), !allowed);
    assert.equal(requiresMobileWorkspace('Indoor Sales',headers), false);
    assert.equal(requiresMobileWorkspace('Admin',headers), false);
  });
}

test('mobile client hints support phone requests without affecting other roles', () => {
  assert.equal(isPhoneRequest(new Headers({'sec-ch-ua-mobile':'?1'})), true);
  assert.equal(isPhoneRequest(new Headers({'sec-ch-ua-mobile':'?0'})), false);
});
