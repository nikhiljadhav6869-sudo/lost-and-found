import assert from 'node:assert/strict';
import {backupIsCurrent,checkPublicService,checkBackup} from '../scripts/service-health.mjs';
const now=Date.UTC(2026,10,5,12);
const run={head_branch:'main',conclusion:'success',name:'Private backups and maintenance',display_title:'Private backups and maintenance',updated_at:new Date(now-3600000).toISOString()};
assert.equal(backupIsCurrent([run],now),true);
for(const change of [{conclusion:'failure'},{head_branch:'test'},{display_title:'Backup notification drill'},{updated_at:'invalid'},{updated_at:new Date(now+1).toISOString()},{updated_at:new Date(now-36*3600000-1).toISOString()}])
  assert.equal(backupIsCurrent([{...run,...change}],now),false);
assert.equal(backupIsCurrent([],now),false);
let calls=0,waits=0;
const result=await checkPublicService(async(url,options)=>{
  assert.equal(new URL(url).origin,'https://lost-and-found-yzfl.onrender.com');
  assert.equal(options.redirect,'error');
  if(++calls===1) throw Error('cold start');
  return Response.json({intelligence:true,auth:{passwordReset:true}});
},async()=>{waits++;});
assert.deepEqual(result,{app:true,worker:true});assert.equal(calls,2);assert.equal(waits,1);
calls=0;
assert.deepEqual(await checkPublicService(async()=>{calls++;return Response.json({intelligence:false,auth:{passwordReset:true}});},async()=>{}),{app:true,worker:false});
assert.equal(calls,3);
assert.deepEqual(await checkPublicService(async()=>Response.json({unexpected:true}),async()=>{}),{app:false,worker:null});
assert.equal(await checkBackup('test-only',async(url,options)=>{
  assert.equal(new URL(url).hostname,'api.github.com');assert.equal(options.redirect,'error');
  return Response.json({workflow_runs:[run]});
},now),true);
await assert.rejects(checkBackup('',async()=>{throw Error('must not fetch');}));
await assert.rejects(checkBackup('test-only',async()=>new Response('private provider detail',{status:403})),/Backup history could not be checked/);
console.log('PASS service retries, unavailable-worker distinction, backup expiry and sanitized monitor failure');
