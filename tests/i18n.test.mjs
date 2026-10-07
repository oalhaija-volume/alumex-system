import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const en=JSON.parse(readFileSync(new URL('../messages/en.json',import.meta.url)));
const ar=JSON.parse(readFileSync(new URL('../messages/ar.json',import.meta.url)));
const output=ts.transpileModule(readFileSync(new URL('../src/lib/i18nFormatting.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const format={};new Function('require','exports',output)(name=>{assert.equal(name,'./i18n');return {messagesByLocale:{en,ar}};},format);
test('Arabic covers every English key and preserves interpolation parameters',()=>{
 const params=s=>[...s.matchAll(/\{([^{}]+)\}/g)].map(m=>m[1]).sort();
 function check(english,arabic,path='') {if(typeof english==='string'){assert.equal(typeof arabic,'string',path);assert.ok(arabic.trim(),path);assert.deepEqual(params(arabic),params(english),path);}else for(const key of Object.keys(english))check(english[key],arabic?.[key],path+'.'+key);}
 check(en,ar);
});
test('translated labels leave stored codes and user-supplied text intact',()=>{
 assert.equal(format.translateTerm('ar','Sliding'),'سحاب');assert.equal(format.translateTerm('en','Sliding'),'Sliding');
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
test('Iraqi currency and dates use the selected language and Baghdad timezone',()=>{
 assert.equal(format.localizedMoney('en',1216000),'1,216,000 IQD');assert.match(format.localizedMoney('ar',1216000),/د\.ع$/);assert.doesNotMatch(format.localizedMoney('ar',1216000),/IQD/);
 assert.match(format.localizedDateTime('en','2026-10-06T22:30:00Z'),/7 Oct 2026.*01:30/);
 assert.match(format.localizedDateTime('ar','2026-10-06T22:30:00Z'),/[\u0600-\u06ff]/);
});
