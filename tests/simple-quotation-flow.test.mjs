import assert from 'node:assert/strict';
import test from 'node:test';
import {isInitialOpeningValid} from '../src/lib/measurements/initialOpening.ts';
import {applyProjectSystem} from '../src/lib/quotations/projectSystem.ts';
import {centimetersToSquareMeters} from '../src/lib/measurements/area.ts';
import {calculateQuotationTotals} from '../src/components/quotations/quotationTypes.ts';

test('initial measurement accepts only dimensions and quantity without opening details', () => {
  assert.equal(isInitialOpeningValid({width:120,height:200,quantity:3}),true);
  for (const invalid of [
    {width:0,height:200,quantity:1}, {width:100,height:NaN,quantity:1},
    {width:Infinity,height:200,quantity:1}, {width:100,height:200,quantity:0},
    {width:100,height:200,quantity:1.5},
  ]) assert.equal(isInitialOpeningValid(invalid),false);
});

test('one project system prices all measured openings and preserves measurement quantities', () => {
  const lines = [
    {id:'one',width:100,height:200,quantity:3,productSystem:'',unitPrice:0,discountPercent:0,lineType:'base'},
    {id:'two',width:150,height:200,quantity:2,productSystem:'Old',unitPrice:9,discountPercent:0,lineType:'base'},
    {id:'extra',width:100,height:100,quantity:1,productSystem:'Delivery',unitPrice:50,discountPercent:0,lineType:'service'},
  ];
  const updated = applyProjectSystem(lines,{product_name:'Project System',unit_price:100});
  assert.deepEqual(updated.slice(0,2).map(line => line.quantity),[3,2]);
  assert.deepEqual(updated.slice(0,2).map(line => line.productSystem),['Project System','Project System']);
  assert.equal(updated[2],lines[2]);
  assert.equal(lines[0].unitPrice,0);
  assert.equal(updated.slice(0,2).reduce((sum,line) => sum+centimetersToSquareMeters(line),0),12);
  assert.equal(calculateQuotationTotals(updated,0).grandTotal,1250);
});
