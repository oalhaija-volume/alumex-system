import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesProjectSearch } from '../src/lib/dashboard/projectSearch.ts';

const project = { project_name: 'Al Noor Villa', project_number: 'PRJ-202610-0123', phone: '+964 (770) 123-4567', address: 'Baghdad Karkh' };

test('dashboard search matches name, number, address and formatted phone', () => {
  for (const query of ['', '  ', ' NOOR ', '0123', 'baghdad', '7701234567', '١٢٣٤٥٦٧', '۰۱۲۳', 'villa karkh']) assert.equal(matchesProjectSearch(project,query),true,query);
  for (const query of ['missing','villa rasafa','9999999']) assert.equal(matchesProjectSearch(project,query),false,query);
});
test('status-only dashboards search names and numbers without contact fields', () => {
  const summary = { project_name:'مشروع المنصور',project_number:'PRJ-0007' };
  assert.equal(matchesProjectSearch(summary,'المنصور ٠٠٠٧'),true);
  assert.equal(matchesProjectSearch(summary,'964770'),false);
});
