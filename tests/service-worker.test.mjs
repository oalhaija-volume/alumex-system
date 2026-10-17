import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function worker(){
 const listeners={},saved=new Map(),requests=[];
 let version=1,failAsset=false,network=false,now=100000;
 const key=value=>new URL(typeof value==='string'?value:value.url,'https://example.test').pathname;
 const cache={match:async value=>saved.get(key(value))?.clone(),put:async(value,response)=>saved.set(key(value),response.clone())};
 const self={location:{origin:'https://example.test'},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(type,fn)=>{listeners[type]=fn;}};
 const fetch=async value=>{
  const path=key(value);requests.push(path);
  if(network)throw Error('No network');
  if(path==='/offline')return new Response(`<html><script src="/_next/static/app-${version}.js"></script></html>`,{headers:{'content-type':'text/html'}});
  if(path.startsWith('/_next/static/')&&failAsset)return new Response('missing',{status:503});
  return new Response('network '+path);
 };
 runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{self,caches:{open:async()=>cache},fetch,URL,Response,AbortController,AbortSignal,setTimeout,clearTimeout,Date:{now:()=>now}});
 return {
  saved,requests,
  async install(){await new Promise((resolve,reject)=>listeners.install({waitUntil:p=>p.then(resolve,reject)}));},
  async refresh(){await new Promise((resolve,reject)=>listeners.message({data:{type:'REFRESH_OFFLINE_SHELL'},waitUntil:p=>p.then(resolve,reject)}));},
  navigate(path){let response;listeners.fetch({request:{method:'GET',mode:'navigate',url:'https://example.test'+path},respondWith:p=>{response=p;},waitUntil:p=>{p.catch(()=>{});}});return response;},
  request(path,method='GET'){let response;listeners.fetch({request:{method,mode:'cors',url:'https://example.test'+path},respondWith:p=>{response=p;}});return response;},
  release(n,fail=false){version=n;failAsset=fail;now+=61000;},offline(){network=true;now+=61000;},
 };
}
test('installed public shell and all referenced assets reopen offline; private routes and APIs are never cached',async()=>{
 const w=worker();await w.install();w.offline();
 assert.match(await (await w.navigate('/offline?path=/dashboard')).text(),/app-1/);
 const redirected=await w.navigate('/dashboard');assert.equal(redirected.status,302);assert.equal(redirected.headers.get('location'),'https://example.test/offline?path=%2Fdashboard');
 assert.equal(await (await w.request('/_next/static/app-1.js')).text(),'network /_next/static/app-1.js');
 for(const path of ['/api/workspace','/api/offline','/api/contracts'])assert.equal(w.request(path),undefined);
 assert.equal(w.request('/api/offline','POST'),undefined);assert.equal(w.navigate('/login'),undefined);assert.equal(w.navigate('/auth/logout'),undefined);
 assert.deepEqual([...w.saved.keys()].sort(),['/_next/static/app-1.js','/logos/AlumexLogo.svg','/offline'].sort());
});
test('a failed release download keeps the complete old shell; a later refresh publishes the new shell',async()=>{
 const w=worker();await w.install();w.release(2,true);await w.refresh();
 assert.match(await w.saved.get('/offline').clone().text(),/app-1/);
 w.release(2);await w.refresh();assert.match(await w.saved.get('/offline').clone().text(),/app-2/);
 assert.ok(w.saved.has('/_next/static/app-2.js'));
 // Keep old immutable chunks usable for a form already open during the update.
 assert.ok(w.saved.has('/_next/static/app-1.js'));
});
test('a device launch uses cached HTML even while the network is available',async()=>{
 const w=worker();await w.install();const before=w.requests.length;
 assert.match(await (await w.navigate('/offline')).text(),/app-1/);assert.equal(w.requests.length,before);
});
