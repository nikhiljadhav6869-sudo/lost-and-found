import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {build} from 'esbuild';
import {isolate} from './environment.mjs';
isolate('upgrades');
await build({entryPoints:['tests/entry.ts'],outfile:'.sites-runtime/upgrades-entry.mjs',bundle:true,platform:'node',format:'esm',target:'node24',packages:'external',alias:{'cloudflare:workers':path.resolve('local/storage.mjs')}});
const {api,auth,env,isStrongMatch,maintain}=await import('../.sites-runtime/upgrades-entry.mjs');
const origin='http://127.0.0.1:3000';let ip=1;
class Client{
  cookie='';address='192.0.2.'+ip++;
  async call(url,body,method=body?'POST':'GET',status=200){
    const headers={origin,cookie:this.cookie,'cf-connecting-ip':this.address};if(body&&!(body instanceof FormData))headers['content-type']='application/json';
    const response=await (url.startsWith('auth/')?auth:api)[method](new Request(origin+'/api/'+url,{method,headers,body:body?(body instanceof FormData?body:JSON.stringify(body)):undefined}));
    const data=await response.json();assert.equal(response.status,status,`${method} ${url}: ${JSON.stringify(data)}`);
    for(const cookie of response.headers.getSetCookie())if(cookie.startsWith('better-auth.session_token='))this.cookie=cookie.split(';')[0];
    return data;
  }
}
const a=new Client(),b=new Client(),c=new Client();
for(const [client,name]of [[a,'Finder'],[b,'Owner'],[c,'Other']])await client.call('auth/sign-up/email',{name,email:name+'@upgrade.test',password:randomBytes(18).toString('base64url')});
const aid=(await a.call('me')).user.id,bid=(await b.call('me')).user.id;
const data={type:'found',title:'Green canvas backpack',category:'Bags',description:'Green canvas backpack with brown straps near central library.',colour:'Green',brand:'Field',date:'2026-10-08',location:'Central Library Pune',privateDetails:'Private blue stitching inside pocket.',images:[]};
assert.equal(isStrongMatch(75),false);assert.equal(isStrongMatch(76),true);assert.equal(isStrongMatch(NaN),false);
const found=await a.call('reports',data),lost=await b.call('reports',{...data,type:'lost',date:'2026-10-07'});
const alerts=()=>env.DB.prepare('SELECT * FROM notifications WHERE body LIKE ?').bind('Strong match%').all();
assert.equal((await alerts()).results.length,2);assert.deepEqual(new Set((await alerts()).results.map(n=>n.userId)),new Set([aid,bid]));
assert.ok((await a.call('reports/'+found.id)).matches.find(m=>m.report.id===lost.id).strongMatch);
await a.call('reports/'+found.id,data,'PATCH');await b.call('reports/'+lost.id,{...data,type:'lost',date:'2026-10-07'},'PATCH');
assert.equal((await alerts()).results.length,2);
console.log('PASS >75 highlights, both-user alerts and persistent deduplication');
await a.call('blocks',{userId:bid});
await a.call('reports',{...data,title:'Blocked matching backpack'});
assert.equal((await alerts()).results.length,2);assert.equal((await a.call('reports/'+found.id)).matches.length,0);
await a.call('blocks',{userId:bid,remove:true});
await env.DB.prepare('DELETE FROM reports WHERE title=?').bind('Blocked matching backpack').run();
const exactly75=await a.call('reports',{...data,colour:'',brand:'',title:'Green canvas backpack'});
assert.equal((await alerts()).results.length,2);assert.equal((await a.call('reports/'+exactly75.id)).matches[0].score,75);
await a.call('reports/'+exactly75.id,{...data,brand:'',title:'Green canvas backpack'},'PATCH');assert.equal((await alerts()).results.length,4);
console.log('PASS 75 does not notify; crossing threshold notifies; blocked users excluded');
const claim=await b.call('claims',{reportId:found.id,evidence:'The private blue stitching is inside the pocket.'});
const rival=await c.call('claims',{reportId:found.id,evidence:'Another claim with enough private ownership evidence.'});
await a.call('claims/'+claim.id,{action:'approve'});await b.call('claims/'+claim.id,{action:'confirm'});
await c.call('claims/'+claim.id,{action:'cancel'},'POST',403);
await a.call('blocks',{userId:bid});
await b.call('claims/'+claim.id,{action:'cancel'});
const cancelled=(await b.call('claims/'+claim.id)).claim;
assert.equal(cancelled.status,'Cancelled');assert.equal(cancelled.finderConfirmed,0);assert.equal(cancelled.claimantConfirmed,0);
assert.equal((await a.call('reports/'+found.id)).report.status,'Claim Pending');
await a.call('claims/'+rival.id,{action:'approve'});await a.call('claims/'+rival.id,{action:'confirm'});await c.call('claims/'+rival.id,{action:'confirm'});
await c.call('claims/'+rival.id,{action:'cancel'},'POST',409);
console.log('PASS cancellation while blocked, pending rivals survive, completed returns cannot cancel');

async function afterClaimRead(claimId,task,competing){
 const original=env.DB.prepare;let release,reached,intercepted=false;
 const resumed=new Promise(resolve=>release=resolve),snapshot=new Promise(resolve=>reached=resolve);
 env.DB.prepare=function(query){const prepared=original.call(this,query);if(!query.startsWith('SELECT c.*,r.owner'))return prepared;
  const bind=prepared.bind;prepared.bind=function(...args){const bound=bind.apply(this,args);if(args[0]!==claimId||intercepted)return bound;intercepted=true;const first=bound.first;bound.first=async function(...rest){const row=await first.apply(this,rest);reached();await resumed;return row;};return bound;};return prepared;};
 const pending=task();try{await Promise.race([snapshot,pending.then(()=>{throw new Error('No snapshot intercepted');})]);await competing();}finally{env.DB.prepare=original;release();}await pending;
}
for(const first of ['cancel','confirm']){
 await env.DB.prepare('DELETE FROM limits').run();
 const r=await a.call('reports',{...data,title:first+' race backpack'}),cl=await c.call('claims',{reportId:r.id,evidence:'Hidden private stitching inside the pocket.'});
 await a.call('claims/'+cl.id,{action:'approve'});await a.call('claims/'+cl.id,{action:'confirm'});
 if(first==='cancel')await afterClaimRead(cl.id,()=>c.call('claims/'+cl.id,{action:'confirm'},'POST',409),()=>a.call('claims/'+cl.id,{action:'cancel'}));
 else await afterClaimRead(cl.id,()=>a.call('claims/'+cl.id,{action:'cancel'},'POST',409),()=>c.call('claims/'+cl.id,{action:'confirm'}));
 const actual=(await a.call('claims/'+cl.id)).claim;assert.equal(actual.status,first==='cancel'?'Cancelled':'Returned');
 assert.equal((await a.call('reports/'+r.id)).report.status,first==='cancel'?'Open':'Returned');
}
console.log('PASS cancellation vs final confirmation races preserve the committed outcome');

await env.DB.prepare('DELETE FROM limits').run();
const photo='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.png';
await env.BUCKET.put(photo,fs.readFileSync('tests/fixtures/sample.png'));
await env.DB.prepare('INSERT INTO uploads(id,owner,created) VALUES(?,?,?)').bind(photo,aid,Date.now()-8*86400000).run();
await env.DB.prepare('INSERT INTO limits(key,count) VALUES(?,1)').bind('test:1').run();
const preview=await maintain(env.DB,env.BUCKET);assert.equal(preview.candidates,1);assert.ok(await env.BUCKET.get(photo));
const retryBucket={delete:async()=>{throw new Error('simulated outage');}};
assert.equal((await maintain(env.DB,retryBucket,{apply:true})).failedUploads,1);
await a.call('reports',{...data,images:['/api/media/'+photo]},'POST',409);
assert.equal((await maintain(env.DB,env.BUCKET,{apply:true})).deletedUploads,1);assert.equal(await env.BUCKET.get(photo),null);
const kept='bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee.png';
await env.BUCKET.put(kept,fs.readFileSync('tests/fixtures/sample.png'));await env.DB.prepare('INSERT INTO uploads(id,owner,created) VALUES(?,?,?)').bind(kept,aid,Date.now()-8*86400000).run();
await a.call('reports',{...data,images:['/api/media/'+kept]});assert.equal((await maintain(env.DB,env.BUCKET)).candidates,0);
console.log('PASS cleanup preview, retry queue, attachment guard and retention of published photos');
process.env.ADMIN_USER_IDS=aid;
await b.call('admin/operations',undefined,'GET',403);const ops=await a.call('admin/operations');assert.equal(ops.storage,'local');assert.ok(!JSON.stringify(ops).includes(process.env.BETTER_AUTH_SECRET));
console.log('PASS admin operations access control and no secrets in response');
const {backupData,restoreBackup}=await import('../local/backup.mjs');
const password=randomBytes(28).toString('base64url'),archive=await backupData(env.DB,env.BUCKET,password);
assert.ok(!archive.toString().includes('Private blue stitching'));
assert.throws(()=>restoreBackup(archive,'wrong-password-long-enough',path.join(process.env.DATA_DIR,'wrong')));
const destination=path.join(process.env.DATA_DIR,'restore');const restored=restoreBackup(archive,password,destination);
assert.equal(restored.photos,1);assert.deepEqual(fs.readFileSync(path.join(destination,'uploads',kept)),fs.readFileSync('tests/fixtures/sample.png'));
const {DatabaseSync}=await import('node:sqlite');const restoredDb=new DatabaseSync(path.join(destination,'lost-found.sqlite'),{readOnly:true});
assert.equal(restoredDb.prepare('SELECT status FROM claims WHERE id=?').get(rival.id).status,'Returned');restoredDb.close();
assert.throws(()=>restoreBackup(archive,password,destination),/new directory/);
console.log('PASS encrypted backup, wrong-key rejection, database/photo restore and overwrite protection');
