import assert from 'node:assert/strict';
import test from 'node:test';
import {generateEmployeeCredentials} from '../src/lib/auth/employeeCredentials.ts';
import {isValidUsername} from '../src/lib/auth/username.ts';

test('generated logins support Arabic names and repeated employee names', () => {
  const seen = new Set();
  for (const name of ['أحمد محمد', 'John Smith', 'John Smith', ' A ', 'Élodie Martin']) {
    const result = generateEmployeeCredentials(name);
    assert.ok(isValidUsername(result.username));
    assert.ok(!seen.has(result.username));
    seen.add(result.username);
    assert.ok(result.password.length >= 24);
    assert.match(result.password, /[a-z]/);
    assert.match(result.password, /[A-Z]/);
    assert.match(result.password, /[0-9]/);
    assert.match(result.password, /[^A-Za-z0-9]/);
    assert.ok(!result.password.includes(name));
  }
});
