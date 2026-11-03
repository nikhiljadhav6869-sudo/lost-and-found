import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {build} from 'esbuild';
import {isolate} from '../tests/environment.mjs';
import {embed} from './models.mjs';

const directory = process.argv[2];
if (!directory) throw Error('Supply the extracted COIL-20 image directory.');
isolate('queue-load');
await build({entryPoints:['tests/entry.ts'],outfile:'.sites-runtime/queue-load-entry.mjs',bundle:true,format:'esm',platform:'node',packages:'external',alias:{'cloudflare:workers':path.resolve('local/storage.mjs')}});
const {auth,api,workerHeartbeat,processSearchJobs}=await import('../.sites-runtime/queue-load-entry.mjs');
const origin='http://127.0.0.1:3000';
const clients=[];
for (let i=1;i<=10;i++) {
  let cookie='';
  async function call(route,body) {
    const multipart=body instanceof FormData;
    const request=new Request(origin+'/api/'+route,{method:body?'POST':'GET',headers:{origin,cookie,'cf-connecting-ip':'192.0.2.'+i,...(multipart?{}:{'content-type':'application/json'})},body:body?(multipart?body:JSON.stringify(body)):undefined});
    const handler=route.startsWith('auth/')?auth:api;
    const response=await handler[request.method](request);
    assert.equal(response.status,200,route);
    for(const value of response.headers.getSetCookie())if(value.startsWith('better-auth.session_token='))cookie=value.split(';')[0];
    return response.json();
  }
  await call('auth/sign-up/email',{email:'load'+i+'@fixture.test',password:randomBytes(24).toString('hex'),name:'Local tester '+i});
  const form=new FormData();
  form.append('file',new Blob([await readFile(path.join(directory,'obj'+i+'__0.png'))],{type:'image/png'}),'sample.png');
  const {url}=await call('upload',form);
  clients.push({call,url});
}
await workerHeartbeat();
const start=performance.now();
const jobs=await Promise.all(clients.map(({call,url})=>call('smart-search',{query:'small household object',image:url})));
const acceptedMs=Math.round(performance.now()-start);
const completion=[];
for(let batch=0;batch<2;batch++){
  // Arrival immediately after a worker poll. Same cadence and search batch limit as the CLI.
  await delay(15000);
  assert.equal(await processSearchJobs(embed,5),5);
  const statuses=await Promise.all(clients.map(({call},i)=>call('smart-search/'+jobs[i].id)));
  for(const [i,result] of statuses.entries())if(result.state==='ready' && completion[i]===undefined)completion[i]=Math.round(performance.now()-start);
}
assert.equal(completion.filter(Number.isFinite).length,10);
console.log(JSON.stringify({simultaneousSearches:10,completed:10,acceptedMs,completionAtBatchCheckMs:completion.sort((a,b)=>a-b),rssMB:Math.round(process.memoryUsage().rss/1048576)},null,2));
