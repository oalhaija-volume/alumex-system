import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path,dependencies={}) {
 const code=ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const exports={};
 new Function('require','exports',code)(name=>{
  if(!(name in dependencies))throw Error(`Unexpected dependency: ${name}`);
  return dependencies[name];
 },exports);
 return exports;
}
const catalogRules=load('../src/lib/workflow/catalogRules.ts');
const pricing=load('../src/lib/workflow/pricing.ts',{'./catalogRules':catalogRules});
const {quotationItemGroups}=load('../src/lib/quotations/itemGroups.ts',{
 '../workflow/catalogRules':catalogRules,
 '@/lib/workflow/catalogRules':catalogRules,
});
const charge=(id,name,total)=>({id,name,unit:'item',rate:total,quantity:1,total});
function line(id,{type='Window',direction='Sliding',product='Alumex System',systemAmount=240000,glassAmount=0,extras=[]}={}) {
 const system={...charge(`system-${id}`,product,systemAmount),unit:'sqm'};
 const glass=glassAmount?{...charge(`glass-${id}`,'Low-E Glass',glassAmount),unit:'sqm'}:null;
 return {opening:{id,floor:'GF',room:'Office',width:100,height:100,quantity:1,opening_type:type,opening_direction:direction},area:1,system,glass,extras,total:system.total+(glass?.total??0)+extras.reduce((sum,item)=>sum+item.total,0)};
}
function freeze(value) {
 if(value&&typeof value==='object'){
  Object.values(value).forEach(freeze);
  Object.freeze(value);
 }
 return value;
}

test('quotation and contract groups put sliding, hinged, curtain wall and louvers together in a stable order',()=>{
 const lines=[
  line('hinged-door',{type:'Door',direction:'Hinged',product:'Alumex Hinged Door',systemAmount:305000}),
  line('curtain',{type:'Curtain Wall',direction:null,product:'Curtain Wall',systemAmount:600000}),
  line('sliding-first'),
  line('louver',{type:'Louver',direction:'Hinged',product:'Louver',systemAmount:150000}),
  line('hinged-window',{direction:'Hinged',product:'Alumex Hinged Window',systemAmount:260000}),
  line('sliding-second',{type:'Door',systemAmount:280000}),
 ];
 const result=quotationItemGroups({lines});
 assert.deepEqual(result.map(group=>group.label),['Sliding','Hinged','Curtain Wall','Louver']);
 assert.deepEqual(result.map(group=>group.lines.map(item=>item.opening.id)),[
  ['sliding-first','sliding-second'],['hinged-door','hinged-window'],['curtain'],['louver'],
 ]);
 assert.deepEqual(result.map(group=>group.subtotal),[520000,565000,600000,150000]);
 assert.deepEqual(result.map(group=>group.key),['sliding','hinged','curtain wall','louver']);
});

test('group subtotals include glass, shutters, motors and facade extras without applying discounts twice',()=>{
 const saved=pricing.applyQuotationDiscount({
  lines:[
   line('sliding',{glassAmount:20000,extras:[charge('shutter','Roller shutter',35000),charge('motor','Roller shutter motor',125000)]}),
   line('hinged',{direction:'Hinged',systemAmount:260000}),
   line('curtain',{type:'Curtain Wall',direction:null,product:'Curtain Wall',systemAmount:400000}),
  ],
  additionalItems:[{...charge('facade-curtain','Curtain Wall',600000),extras:[charge('pushout','Curtain Wall Pushout',50000)]}],
  total:0,currency:'IQD',createdAt:'2026-11-01T08:00:00Z',preparedBy:'fixture',
 },5);
 const before=structuredClone(saved);
 freeze(saved);
 const result=quotationItemGroups(saved);
 assert.equal(result.find(group=>group.label==='Sliding').subtotal,420000);
 assert.equal(result.find(group=>group.label==='Hinged').subtotal,260000);
 const curtain=result.find(group=>group.label==='Curtain Wall');
 assert.equal(curtain.subtotal,1050000);
 assert.deepEqual(curtain.lines.map(item=>item.opening.id),['curtain']);
 assert.deepEqual(curtain.additionalItems.map(item=>item.id),['facade-curtain']);
 const groupTotal=result.reduce((sum,group)=>sum+group.subtotal,0);
 assert.equal(groupTotal,saved.discount.subtotal);
 assert.equal(groupTotal-saved.discount.amount,saved.total);
 assert.deepEqual(saved,before,'Display grouping must not reorder saved arrays or change any saved amounts');
});

test('Louver and Lift & Slide products take precedence over a measured window operation',()=>{
 const result=quotationItemGroups({lines:[
  line('window-louver',{direction:'Hinged',product:'Louvres'}),
  line('lift-slide',{direction:'Hinged',product:'Lift & Slide'}),
  line('regular-hinge',{direction:'Hinged'}),
 ]});
 assert.deepEqual(result.map(group=>[group.label,group.lines.map(item=>item.opening.id)]),[
  ['Sliding',['lift-slide']],['Hinged',['regular-hinge']],['Louver',['window-louver']],
 ]);
});

test('legacy openings without an operation use explicit sliding and hinged system names',()=>{
 const result=quotationItemGroups({lines:[
  line('old-hinge',{direction:null,product:'Alumex Hinged Window'}),
  line('old-slide',{type:'Door',direction:null,product:'Alumex Sliding Door'}),
 ]});
 assert.deepEqual(result.map(group=>[group.label,group.lines.map(item=>item.opening.id)]),[
  ['Sliding',['old-slide']],['Hinged',['old-hinge']],
 ]);
});

test('standalone aliases merge into the matching opening group with consistent normalized keys',()=>{
 const result=quotationItemGroups({
  lines:[line('curtain',{type:'Curtain Wall',direction:null,product:'Curtain Wall'})],
  additionalItems:[
   charge('curtain-a',' curtain-wall ',100000),
   charge('curtain-b','CURTAIN   WALL',200000),
   charge('louver-a','Louvers',150000),
   charge('louver-b','louvres',175000),
   charge('lift','Lift-and-Slide',300000),
  ],
 });
 assert.deepEqual(result.map(group=>[group.key,group.subtotal]),[['sliding',300000],['curtain wall',540000],['louver',325000]]);
 assert.deepEqual(result.find(group=>group.key==='curtain wall').additionalItems.map(item=>item.id),['curtain-a','curtain-b']);
});

test('empty and standalone-only quotations keep all products in alphabetical groups',()=>{
 assert.deepEqual(quotationItemGroups({lines:[]}),[]);
 assert.deepEqual(quotationItemGroups({lines:[],additionalItems:[]}),[]);
 const result=quotationItemGroups({lines:[],additionalItems:[
  charge('zinc','Zinc Panels',70000),
  charge('cladding-one','Cladding',100000),
  charge('photocell','Photocell Door - GEZE',300000),
  charge('cladding-two',' cladding ',50000),
 ]});
 assert.deepEqual(result.map(group=>group.key),['cladding','photocell door geze','zinc panels']);
 assert.deepEqual(result.map(group=>group.subtotal),[150000,300000,70000]);
 assert.deepEqual(result[0].additionalItems.map(item=>item.id),['cladding-one','cladding-two']);
 assert.ok(result.every(group=>group.lines.length===0));
});

test('unknown and historical opening types remain visible with their full saved prices',()=>{
 const saved={lines:[
  line('custom',{type:'Custom opening',direction:null,product:'Special System',systemAmount:123456}),
  line('no-type',{type:null,direction:null,product:'Historic Product',systemAmount:234567}),
  line('no-label',{type:null,direction:null,product:'',systemAmount:345678}),
 ]};
 const result=quotationItemGroups(saved);
 assert.equal(result.flatMap(group=>group.lines).length,3);
 assert.deepEqual(new Set(result.flatMap(group=>group.lines.map(item=>item.opening.id))),new Set(['custom','no-type','no-label']));
 assert.ok(result.every(group=>group.label.trim().length>0));
 assert.equal(result.reduce((sum,group)=>sum+group.subtotal,0),703701);
});
