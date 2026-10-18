import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as dates from '../src/lib/dates.ts';
const en=JSON.parse(readFileSync(new URL('../messages/en.json',import.meta.url)));
const ar=JSON.parse(readFileSync(new URL('../messages/ar.json',import.meta.url)));
const output=ts.transpileModule(readFileSync(new URL('../src/lib/i18nFormatting.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const format={};new Function('require','exports',output)(name=>{if(name==='./dates')return dates;assert.equal(name,'./i18n');return {messagesByLocale:{en,ar}};},format);
test('Arabic covers every English key and preserves interpolation parameters',()=>{
 const params=s=>[...s.matchAll(/\{([^{}]+)\}/g)].map(m=>m[1]).sort();
 function check(english,arabic,path='') {if(typeof english==='string'){assert.equal(typeof arabic,'string',path);assert.ok(arabic.trim(),path);assert.deepEqual(params(arabic),params(english),path);}else for(const key of Object.keys(english))check(english[key],arabic?.[key],path+'.'+key);}
 check(en,ar);
});
test('translated labels leave stored codes and user-supplied text intact',()=>{
 assert.equal(format.translateTerm('ar','Sliding'),'سلايد');assert.equal(format.translateTerm('en','Sliding'),'Sliding');
 assert.equal(format.translateTerm('ar','Custom atrium 42'),'Custom atrium 42');
 assert.equal(format.interpolateMessage('{name} / {number}',{name:'{number}',number:7}),'{number} / 7');
 assert.equal(format.translateTerm('ar','Opening {number}',{number:3}),'الفتحة 3');
});
test('errors translate dynamically, preserve product names, and follow language changes',()=>{
 assert.equal(format.translateError('ar','Set a catalog price for Low-E Glass before quoting.'),'حدد سعر زجاج منخفض الانبعاثية في دليل الأسعار قبل إعداد عرض السعر.');
 assert.equal(format.translateError('ar','Username or password is incorrect.'),'اسم المستخدم أو كلمة المرور غير صحيحة.');
 assert.equal(format.translateError('en','اسم المستخدم أو كلمة المرور غير صحيحة.'),'Invalid login credentials');
 assert.equal(format.translateError('ar','Opaque internal database error'),ar.terms['Unable to complete this action. Please try again or contact the administrator.']);
});
test('currency follows the selected language while dates use English digits and Baghdad timezone',()=>{
 assert.equal(format.localizedMoney('en',1216000),'1,216,000 IQD');assert.match(format.localizedMoney('ar',1216000),/د\.ع$/);assert.doesNotMatch(format.localizedMoney('ar',1216000),/IQD/);
 for(const locale of ['en','ar'])assert.equal(format.localizedDateTime(locale,'2026-10-06T22:30:00Z'),'07/10/2026, 01:30');
});


test('business dates are zero-padded Gregorian dates across Baghdad day and year boundaries',()=>{
 for(const [value,date,time] of [
  ['2026-01-02T09:05:00Z','02/01/2026','12:05'],
  ['2026-12-31T21:00:00Z','01/01/2027','00:00'],
  ['2028-02-28T22:59:00Z','29/02/2028','01:59'],
 ]){
  for(const input of [value,new Date(value),Date.parse(value)]){
   assert.equal(dates.formatBusinessDate(input),date);
   assert.equal(dates.formatBusinessDateTime(input),`${date}, ${time}`);
  }
 }
 assert.equal(dates.formatBusinessDate('2026-01-02'),'02/01/2026');
 assert.equal(dates.formatBusinessDate('invalid'),'—');
 assert.equal(dates.formatBusinessDateTime('invalid'),'—');
});

test('commercial facade numbers and internal-work labels translate without changing stored values',()=>{
 assert.equal(format.translateTerm('en','Facade 2'),'Facade 2');
 assert.equal(format.translateTerm('ar','Facade 2'),'واجهة 2');
 assert.equal(format.translateTerm('ar','Facade {number}',{number:'10'}),'واجهة 10');
 assert.equal(format.translateTerm('ar','Internal works'),'اعمال داخلية');
});
