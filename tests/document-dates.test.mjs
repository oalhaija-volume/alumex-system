import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';
import { formatBusinessDate } from '../src/lib/dates.ts';

for (const locale of ['en', 'ar']) for (const kind of ['Quotation', 'Contract']) test(`${locale} ${kind} issue date uses English digits and DD/MM/YYYY`, () => {
  const exports = {};
  const source = ts.transpileModule(readFileSync(new URL('../src/components/workflow/CommercialDocument.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', source)(name => {
    if (name === 'react/jsx-runtime') return jsx;
    if (name === '@/components/i18n/I18nProvider') return { useI18n: () => ({ locale, term: value => value, formatDate: formatBusinessDate }) };
    if (name === '@/lib/workflow/pricing' || name === './OpeningAreaIndicator') return {};
    throw Error(name);
  }, exports);
  const html = renderToStaticMarkup(React.createElement(exports.DocumentHeader, { kind, number: 'DATE-TEST', createdAt: '2026-12-31T21:05:00Z' }));
  assert.match(html, /<bdi dir="ltr">01\/01\/2027<\/bdi>/);
});
