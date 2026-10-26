import assert from 'node:assert/strict';
import {build} from 'esbuild';
await build({entryPoints:['lib/request.ts'],outfile:'.sites-runtime/request.mjs',bundle:true,platform:'node',format:'esm'});
const {requestJson}=await import('../.sites-runtime/request.mjs');
const original=globalThis.fetch;let calls=0;
try{
 globalThis.fetch=async()=>{calls++;return calls===1?new Response('<html>starting</html>',{status:503}):Response.json({ok:true});};
 assert.equal((await requestJson('reports')).ok,true);assert.equal(calls,2);
 calls=0;globalThis.fetch=async()=>{calls++;throw new TypeError('private network failure');};
 await assert.rejects(()=>requestJson('reports',{title:'test'}),/Check your dashboard/);assert.equal(calls,1);
 calls=0;globalThis.fetch=async()=>{calls++;return Response.json({error:'Slow down'},{status:429});};
 await assert.rejects(()=>requestJson('reports'),/Slow down/);assert.equal(calls,1);
 calls=0;globalThis.fetch=async()=>{calls++;return new Response('<html>not json</html>');};
 await assert.rejects(()=>requestJson('reports'),/incomplete response/);assert.equal(calls,2);
 console.log('PASS read retry, no duplicate mutation retry, rate limit and non-JSON error handling');
}finally{globalThis.fetch=original;}
