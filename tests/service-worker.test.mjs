import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function worker(userAgent='iPhone',options={}){
 const listeners={},saved=new Map(),requests=[],background=[],cacheNames=[];
 const buckets=new Map([['alumex-field-shell-v30',saved]]),blocked=new Map();
 let navigations=0,storageAccesses=0,cacheDeletions=0;
 let version=1,failAsset=false,network=false,now=100000;
 const key=value=>new URL(typeof value==='string'?value:value.url,'https://example.test').pathname;
 const cache=records=>({match:async value=>records.get(key(value))?.clone(),put:async(value,response)=>records.set(key(value),response.clone())});
 const caches={
  open:async name=>{cacheNames.push(name);if(!buckets.has(name))buckets.set(name,new Map());return cache(buckets.get(name));},
  match:async value=>{for(const records of buckets.values()){const response=records.get(key(value));if(response)return response.clone();}},
  delete:async()=>{cacheDeletions++;throw Error('Caches must be retained');},
 };
 const self={navigator:{userAgent,onLine:true},location:{origin:'https://example.test'},clients:{claim:async()=>{},matchAll:async()=>[{navigate:async()=>{navigations++;}}]},skipWaiting:async()=>{},addEventListener:(type,fn)=>{listeners[type]=fn;}};
 const fetch=async value=>{
  const path=key(value);requests.push(path);
  if(network)throw Error('No network');
  if(blocked.has(path))await blocked.get(path).promise;
  if(path==='/offline')return new Response(`<html><link rel="stylesheet" href="/_next/static/styles-${version}.css"><script src="/_next/static/app-${version}.js"></script></html>`,{headers:{'content-type':'text/html'}});
  if(path.startsWith('/_next/static/')&&(failAsset===true||failAsset===path))return new Response('missing',{status:503});
  return new Response('network '+path);
 };
 runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{self,caches,fetch,URL,Response,AbortController,AbortSignal,setTimeout:(callback,ms)=>setTimeout(callback,ms===4000?(options.navigationWaitMs??ms):ms),clearTimeout,Date:{now:()=>now},indexedDB:{open:()=>{storageAccesses++;throw Error('Business storage must not change');},deleteDatabase:()=>{storageAccesses++;throw Error('Business storage must not change');}}});
 return {
  saved,requests,cacheNames,
  get navigations(){return navigations;},get storageAccesses(){return storageAccesses;},get cacheDeletions(){return cacheDeletions;},
  async install(){await new Promise((resolve,reject)=>listeners.install({waitUntil:p=>p.then(resolve,reject)}));},
  async refresh(){await new Promise((resolve,reject)=>listeners.message({data:{type:'REFRESH_OFFLINE_SHELL'},waitUntil:p=>p.then(resolve,reject)}));},
  navigate(path){let response;listeners.fetch({request:{method:'GET',mode:'navigate',url:'https://example.test'+path},respondWith:p=>{response=p;},waitUntil:p=>{background.push(p.catch(()=>{}));}});return response;},
  request(path,method='GET'){let response;listeners.fetch({request:{method,mode:'cors',url:'https://example.test'+path},respondWith:p=>{response=p;}});return response;},
  release(n,fail=false,advance=true){version=n;failAsset=fail;if(advance)now+=61000;},offline(){network=true;self.navigator.onLine=false;now+=61000;},
  block(path){let resume;const promise=new Promise(resolve=>{resume=resolve;});blocked.set(path,{promise,resume});return()=>{blocked.delete(path);resume();};},
  async settled(){await Promise.all(background);},
  legacy(records){buckets.set('alumex-field-shell-v29',new Map(records));},
 };
}
test('installed public shell and all referenced assets reopen offline; private routes and APIs are never cached',async()=>{
 const w=worker();await w.install();w.offline();
 assert.match(await (await w.navigate('/offline?path=/dashboard')).text(),/app-1/);
 const redirected=await w.navigate('/dashboard');assert.equal(redirected.status,302);assert.equal(redirected.headers.get('location'),'https://example.test/offline?path=%2Fdashboard');
 const log=await w.navigate('/project-log');assert.equal(log.status,302);assert.equal(log.headers.get('location'),'https://example.test/offline?path=%2Fproject-log');
 assert.equal(await (await w.request('/_next/static/app-1.js')).text(),'network /_next/static/app-1.js');
 for(const path of ['/api/workspace','/api/offline','/api/contracts'])assert.equal(w.request(path),undefined);
 assert.equal(w.request('/api/offline','POST'),undefined);assert.equal(w.navigate('/login'),undefined);assert.equal(w.navigate('/auth/logout'),undefined);
 assert.deepEqual([...w.saved.keys()].sort(),['/_next/static/app-1.js','/_next/static/styles-1.css','/logos/AlumexLogo.svg','/offline'].sort());
});
test('a failed release download keeps the complete old shell; a later refresh publishes the new shell',async()=>{
 const w=worker();await w.install();w.release(2,true);await w.refresh();
 assert.match(await w.saved.get('/offline').clone().text(),/app-1/);
 w.release(2);await w.refresh();assert.match(await w.saved.get('/offline').clone().text(),/app-2/);
 assert.ok(w.saved.has('/_next/static/app-2.js'));
 // Keep old immutable chunks usable for a form already open during the update.
 assert.ok(w.saved.has('/_next/static/app-1.js'));
});
test('one online launch returns current HTML and assets even inside the background refresh throttle',async()=>{
 const w=worker();await w.install();const before=w.requests.length;
 w.release(2,false,false);
 assert.match(await (await w.navigate('/offline?path=/intake')).text(),/app-2/);
 assert.ok(w.requests.slice(before).includes('/offline'));
 assert.ok(w.saved.has('/_next/static/app-2.js'));
 assert.ok(w.saved.has('/_next/static/styles-2.css'));
 assert.ok(w.saved.has('/_next/static/app-1.js'));
 assert.ok(w.cacheNames.every(name=>name==='alumex-field-shell-v30'));
 assert.equal(w.navigations,0);assert.equal(w.storageAccesses,0);assert.equal(w.cacheDeletions,0);
});

test('an incomplete online release opens the complete previous shell',async()=>{
 const w=worker();await w.install();w.release(2,'/_next/static/styles-2.css',false);
 assert.match(await (await w.navigate('/offline?path=/intake')).text(),/app-1/);
 assert.match(await w.saved.get('/offline').clone().text(),/app-1/);
 assert.ok(w.saved.has('/_next/static/app-1.js'));
 assert.ok(w.saved.has('/_next/static/styles-1.css'));
 assert.equal(w.saved.has('/_next/static/styles-2.css'),false);
 assert.equal(w.navigations,0);assert.equal(w.storageAccesses,0);assert.equal(w.cacheDeletions,0);
});

test('a slow online launch falls back promptly while the verified update finishes in the background',async()=>{
 const w=worker('iPhone',{navigationWaitMs:20});await w.install();w.release(2,false,false);
 const resume=w.block('/offline');
 const response=await w.navigate('/offline?path=/projects');
 assert.match(await response.text(),/app-1/);
 assert.match(await w.saved.get('/offline').clone().text(),/app-1/);
 resume();await w.settled();
 assert.match(await w.saved.get('/offline').clone().text(),/app-2/);
 assert.equal(w.navigations,0);assert.equal(w.storageAccesses,0);assert.equal(w.cacheDeletions,0);
});

test('offline launch immediately uses the old-version cache and retains its assets without a network request',async()=>{
 const w=worker();
 w.legacy([
  ['/offline',new Response('<html><script src="/_next/static/old-form.js"></script></html>',{headers:{'content-type':'text/html'}})],
  ['/_next/static/old-form.js',new Response('previous running form')],
 ]);
 w.offline();
 assert.match(await (await w.navigate('/offline?path=/intake')).text(),/old-form/);
 assert.equal(await (await w.request('/_next/static/old-form.js')).text(),'previous running form');
 assert.equal(w.requests.length,0);
 assert.equal(w.navigations,0);assert.equal(w.storageAccesses,0);assert.equal(w.cacheDeletions,0);
});

test('desktop installations never open the cached device workspace or redirect offline',async()=>{
 const w=worker('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
 await w.install();assert.equal(w.requests.length,0);
 const response=await w.navigate('/offline?path=/projects');
 assert.equal(response.status,302);assert.equal(response.headers.get('location'),'https://example.test/dashboard');
 assert.equal(w.navigate('/dashboard'),undefined);assert.equal(w.navigate('/projects'),undefined);
});
