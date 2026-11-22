import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const code = ts.transpileModule(readFileSync(new URL('../src/lib/contracts/agreement2027Pagination.ts', import.meta.url), 'utf8'), {
 compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function('exports', code)(exports);
const { paginateAgreement2027Blocks, balancedAgreement2027Pages } = exports;
const block = (id, height, keepWithNext = false) => ({ id, height, keepWithNext });
const ids = pages => pages.map(page => page.map(item => item.id));
const total = page => page.reduce((sum, item) => sum + item.height, 0);

test('empty documents produce no pages and exact-fit documents produce no trailing blank page', () => {
 assert.deepEqual(paginateAgreement2027Blocks([], 100), []);
 assert.deepEqual(ids(paginateAgreement2027Blocks([block('one', 40), block('two', 60)], 100)), [['one', 'two']]);
 assert.deepEqual(ids(paginateAgreement2027Blocks([block('one', 100), block('two', 100)], 100)), [['one'], ['two']]);
});

test('blocks pack to each available boundary in their original order without empty pages or omitted content', () => {
 const source = [block('first', 35), block('second', 30), block('third', 35), block('fourth', 1), block('fifth', 99)];
 const pages = paginateAgreement2027Blocks(source, 100);
 assert.deepEqual(ids(pages), [['first', 'second', 'third'], ['fourth', 'fifth']]);
 assert.deepEqual(pages.flat(), source);
 assert.ok(pages.every(page => page.length && total(page) <= 100));
});

test('a heading moves to the following page when it and its content cannot fit the remaining space', () => {
 const source = [block('preceding', 80), block('heading', 10, true), block('content', 30), block('after', 20)];
 assert.deepEqual(ids(paginateAgreement2027Blocks(source, 100)), [['preceding'], ['heading', 'content', 'after']]);
});

test('a heading and content stay on the current page when their combined height exactly fits', () => {
 assert.deepEqual(ids(paginateAgreement2027Blocks([block('preceding', 60), block('heading', 10, true), block('content', 30)], 100)), [['preceding', 'heading', 'content']]);
});

test('a fitting chain of linked headings stays with its content instead of stranding the first heading', () => {
 const source = [block('preceding', 50), block('section', 15, true), block('subheading', 15, true), block('content', 50)];
 assert.deepEqual(ids(paginateAgreement2027Blocks(source, 100)), [['preceding'], ['section', 'subheading', 'content']]);
});

test('an impossible keep pair or longer-than-page chain still preserves all indivisible blocks without overflow', () => {
 const source = [block('large-heading', 60, true), block('large-content', 60), block('heading-a', 40, true), block('heading-b', 40, true), block('content', 40)];
 const pages = paginateAgreement2027Blocks(source, 100);
 assert.deepEqual(pages.flat(), source);
 assert.ok(pages.every(page => page.length && total(page) <= 100));
 assert.deepEqual(ids(pages), [['large-heading'], ['large-content'], ['heading-a', 'heading-b'], ['content']]);
});

test('oversized blocks throw explicitly before any content can be silently clipped', () => {
 assert.throws(() => paginateAgreement2027Blocks([block('valid', 20), block('oversized', 101)], 100), /oversized.*split before pagination/);
});

test('invalid capacities and invalid block heights cannot create a pagination result', () => {
 for (const capacity of [0, -1, NaN, Infinity, -Infinity]) assert.throws(() => paginateAgreement2027Blocks([], capacity), /positive finite/);
 for (const height of [-1, NaN, Infinity, -Infinity]) assert.throws(() => paginateAgreement2027Blocks([block('invalid', height)], 100), /finite non-negative/);
});

test('zero-height anchors and final headings remain present without creating empty pages', () => {
 const source = [block('anchor', 0), block('body', 100), block('last-heading', 0, true)];
 assert.deepEqual(ids(paginateAgreement2027Blocks(source, 100)), [['anchor', 'body', 'last-heading']]);
});

test('decimal PDF coordinates do not produce a spurious page from floating point rounding', () => {
 assert.deepEqual(ids(paginateAgreement2027Blocks([block('first', 0.1), block('second', 0.2)], 0.3)), [['first', 'second']]);
});

test('pagination never mutates input blocks or the input array, and retains original object identities', () => {
 const first = Object.freeze(block('first', 60));
 const second = Object.freeze(block('second', 60));
 const source = Object.freeze([first, second]);
 const pages = paginateAgreement2027Blocks(source, 100);
 assert.strictEqual(pages[0][0], first);assert.strictEqual(pages[1][0], second);
 pages[0].push(second);
 assert.deepEqual(source, [first, second]);
});

test('balancing avoids a nearly empty last page while retaining the minimum number of pages', () => {
 const source = [block('first', 300), block('second', 150), block('third', 100), block('fourth', 150)];
 const greedy = paginateAgreement2027Blocks(source, 600);
 const balanced = balancedAgreement2027Pages(source, 600);
 assert.deepEqual(greedy.map(total), [550, 150]);
 assert.deepEqual(balanced.map(total), [300, 400]);
 assert.equal(balanced.length, greedy.length);
 assert.deepEqual(balanced.flat(), source);
});

test('balancing maximizes the least-filled page across an ordered multi-page document', () => {
 const source = [80, 130, 50, 160, 90, 70].map((height, index) => block('block-' + index, height));
 const balanced = balancedAgreement2027Pages(source, 300);
 assert.deepEqual(balanced.map(total), [210, 210, 160]);
 assert.equal(balanced.length, paginateAgreement2027Blocks(source, 300).length);
 assert.deepEqual(balanced.flat(), source);
});

test('balancing keeps linked headings and content together at the real page capacity', () => {
 const source = [block('preceding', 300), block('heading', 20, true), block('content', 250), block('last', 100)];
 assert.deepEqual(ids(balancedAgreement2027Pages(source, 600)), [['preceding'], ['heading', 'content', 'last']]);
 const indivisible = [block('heading', 20, true), block('large-content', 500), block('last', 100)];
 assert.deepEqual(ids(balancedAgreement2027Pages(indivisible, 600)), [['heading', 'large-content'], ['last']]);
});

test('balancing never adds pages or changes single-page and empty documents', () => {
 assert.deepEqual(balancedAgreement2027Pages([], 600), []);
 assert.deepEqual(ids(balancedAgreement2027Pages([block('first', 150), block('second', 100)], 600)), [['first', 'second']]);
 const source = [block('first', 250), block('second', 250), block('third', 250)];
 assert.equal(balancedAgreement2027Pages(source, 600).length, 2);
 assert.throws(() => balancedAgreement2027Pages([block('oversized', 601)], 600), /split before pagination/);
});

test('balanced pagination preserves frozen source objects without mutation', () => {
 const source = Object.freeze([Object.freeze(block('first', 300)), Object.freeze(block('second', 150)), Object.freeze(block('third', 100)), Object.freeze(block('last', 150))]);
 const balanced = balancedAgreement2027Pages(source, 600);
 assert.deepEqual(balanced.flat(), source);
 assert.strictEqual(balanced[0][0], source[0]);
 assert.ok(balanced.every(page => page.length && total(page) <= 600));
});

test('balanced pagination matches the optimal ordered partition across independent small boundary cases', () => {
 for (let encoded = 0; encoded < 3 ** 5; encoded++) {
  let value = encoded;
  const heights = Array.from({ length: 5 }, () => { const height = 2 + value % 3; value = Math.floor(value / 3); return height; });
  let minimumPages = Infinity, bestMinimumFill = -Infinity;
  // Enumerate all possible ordered partitions independently of the paginator.
  for (let cuts = 0; cuts < 2 ** (heights.length - 1); cuts++) {
   const fills = [heights[0]];
   for (let index = 1; index < heights.length; index++) {
    if (cuts & 2 ** (index - 1)) fills.push(heights[index]);
    else fills[fills.length - 1] += heights[index];
   }
   if (fills.some(height => height > 6)) continue;
   if (fills.length < minimumPages) { minimumPages = fills.length; bestMinimumFill = Math.min(...fills); }
   else if (fills.length === minimumPages) bestMinimumFill = Math.max(bestMinimumFill, Math.min(...fills));
  }
  const source = heights.map((height, index) => block('block-' + index, height));
  const balanced = balancedAgreement2027Pages(source, 6);
  assert.equal(balanced.length, minimumPages, heights.join(','));
  assert.equal(Math.min(...balanced.map(total)), bestMinimumFill, heights.join(','));
  assert.deepEqual(balanced.flat(), source);
 }
});
