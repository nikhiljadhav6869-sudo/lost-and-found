import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {api,auth,match,cleanImage} from '../.sites-runtime/test-entry.mjs';
const origin='http://127.0.0.1:3000';
let checks=0;
const ok=message=>{checks++;console.log('PASS '+message);};
class Client{
 cookie='';
 async call(url,body,method=body?'POST':'GET',status=200){
  const headers={origin,cookie:this.cookie};if(body&&!(body instanceof FormData))headers['content-type']='application/json';
  const req=new Request(origin+'/api/'+url,{method,headers,body:body?(body instanceof FormData?body:JSON.stringify(body)):undefined});
  const response=await (url.startsWith('auth/')?auth:api)[method](req);
  const contentType=response.headers.get('content-type')||'';
  const data=contentType.includes('application/json')?await response.json():new Uint8Array(await response.arrayBuffer());
  assert.equal(response.status,status,`${method} ${url}: ${JSON.stringify(data)}`);
  for(const c of response.headers.getSetCookie()){if(c.startsWith('better-auth.session_token='))this.cookie=c.split(';')[0];}
  return data;
 }
}
if(process.argv[2]==='restart'){
 const state=JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR,'assertions.json'),'utf8'));
 const a=new Client();a.cookie=state.cookie;
 const report=await a.call('reports/'+state.report);assert.equal(report.report.status,'Returned');
 const c=await a.call('claims/'+state.claim);assert.equal(c.messages.length,2);assert.equal(c.claim.evidence,'Secret blue stitching behind the inside pocket.');
 const media=await a.call(state.image.replace('/api/',''));assert.ok(media.byteLength>20);
 assert.equal((await a.call('me')).user.id,state.user);
 assert.ok((await a.call('dashboard')).notifications.length>0);
 ok('Reports, images, sessions, claims, messages and notifications survive a fresh process');process.exit(0);
}
const anon=new Client(),finder=new Client(),owner=new Client(),stranger=new Client();
const password=randomBytes(18).toString('base64url');
for(const [client,name] of [[finder,'Finder'],[owner,'Owner'],[stranger,'Stranger']]){await client.call('auth/sign-up/email',{name,email:name.toLowerCase()+'@integration.test',password});assert.ok((await client.call('me')).user);}
ok('Three accounts register and receive authenticated sessions');
await anon.call('dashboard',undefined,'GET',401);await owner.call('auth/sign-out',{});assert.equal((await owner.call('me')).user,null);await owner.call('dashboard',undefined,'GET',401);await owner.call('auth/sign-in/email',{email:'owner@integration.test',password});ok('Login, logout and protected pages');
const fid=(await finder.call('me')).user.id,oid=(await owner.call('me')).user.id;
process.env.ADMIN_USER_IDS=fid;assert.equal((await finder.call('me')).user.admin,true);await stranger.call('admin',undefined,'GET',403);ok('Admin permissions use operator-assigned account IDs');
const imageFiles=['sample.png','sample.jpg','sample.webp'];let images=[];
for(const f of imageFiles){const form=new FormData();form.append('file',new Blob([fs.readFileSync('tests/fixtures/'+f)],{type:f.endsWith('.png')?'image/png':f.endsWith('.jpg')?'image/jpeg':'image/webp'}),f);images.push((await finder.call('upload',form)).url);}
const lostImages=[];for(const f of imageFiles.slice(0,2)){const form=new FormData();form.append('file',new Blob([fs.readFileSync('tests/fixtures/'+f)],{type:f.endsWith('.png')?'image/png':'image/jpeg'}),f);lostImages.push((await owner.call('upload',form)).url);}
await anon.call(images[0].replace('/api/',''),undefined,'GET',404);ok('JPEG, PNG and WebP uploads persist; unpublished media is private');
const invalid=new FormData();invalid.append('file',new Blob(['<svg>bad</svg>'],{type:'image/svg+xml'}),'bad.svg');await finder.call('upload',invalid,'POST',400);
const disguised=new FormData();disguised.append('file',new Blob(['this is not a valid image file'],{type:'image/png'}),'fake.png');await finder.call('upload',disguised,'POST',400);
const oversize=new FormData();oversize.append('file',new Blob([new Uint8Array(5*1024*1024+1)],{type:'image/png'}),'big.png');await finder.call('upload',oversize,'POST',400);ok('Unsupported, disguised and oversized uploads are rejected');
const jpeg=fs.readFileSync('tests/fixtures/sample.jpg');assert.ok(jpeg.includes(Buffer.from('location-secret')));assert.ok(!Buffer.from(cleanImage(jpeg,'image/jpeg')).includes(Buffer.from('location-secret')));ok('Server strips EXIF metadata');
const data={type:'found',title:'Green canvas backpack',category:'Bags',description:'Olive canvas backpack with brown straps left near the community library.',colour:'Green',brand:'Field',date:'2026-10-08',location:'Aundh Library, Pune',privateDetails:'Secret blue stitching behind the inside pocket.',images};
const found=await finder.call('reports',data);const lost=await owner.call('reports',{...data,type:'lost',images:lostImages,date:'2026-10-07'});
const publicData=await anon.call('reports/'+found.id);assert.equal(publicData.report.images.length,3);assert.equal(publicData.report.privateDetails,undefined);assert.ok(publicData.matches.some(m=>m.report.id===lost.id&&m.score>=90));assert.ok(!JSON.stringify(publicData).includes('location-secret'));ok('Lost and found reports have multiple photos, private details stay private, and real matching works');
for(const img of images)assert.ok((await anon.call(img.replace('/api/',''))).length>20);
assert.equal((await anon.call('reports?q=canvas&type=found&category=Bags&location=Aundh&since=2026-10-08&until=2026-10-08')).total,1);
assert.equal((await anon.call('reports?q=nonexistent-unicorn')).total,0);ok('Keyword, type, category, location and date filters; empty search results');
await stranger.call('reports/'+found.id,{...data,title:'Hijacked report'},'PATCH',403);await stranger.call('reports/'+found.id,undefined,'DELETE',403);
await stranger.call('reports',{...data,title:'Stolen image reference'},'POST',400);await finder.call('reports/'+found.id,{...data,title:'Green canvas backpack, updated'},'PATCH');ok('Report editing, deletion and media ownership are enforced server-side');
await owner.call('save',{reportId:found.id,saved:true});assert.equal((await owner.call('dashboard')).saved.length,1);await owner.call('save',{reportId:found.id,saved:false});assert.equal((await owner.call('dashboard')).saved.length,0);ok('Saved items persist and can be removed');
const claim=await owner.call('claims',{reportId:found.id,evidence:data.privateDetails});const rival=await stranger.call('claims',{reportId:found.id,evidence:'A different description of the contents for verification.'});
await stranger.call('claims/'+claim.id,undefined,'GET',403);await stranger.call('claims/'+claim.id+'/messages',{body:'Intrusion'},'POST',403);await owner.call('claims/'+claim.id,{action:'approve'},'POST',403);ok('Only claim participants can read or message; only finder can approve');
await finder.call('claims/'+claim.id+'/messages',{body:'What colour is the stitching inside the pocket?'});await owner.call('claims/'+claim.id+'/messages',{body:'It is blue, in a small cross pattern.'});assert.equal((await owner.call('claims/'+claim.id)).messages.length,2);ok('Two-way private verification messaging');
await finder.call('claims/'+claim.id,{action:'approve'});await finder.call('claims/'+rival.id,{action:'approve'},'POST',409);assert.equal((await anon.call('reports/'+found.id)).report.status,'Return Arranged');
await finder.call('claims/'+claim.id,{action:'confirm'});assert.equal((await anon.call('reports/'+found.id)).report.status,'Return Arranged');await owner.call('claims/'+claim.id,{action:'confirm'});assert.equal((await anon.call('reports/'+found.id)).report.status,'Returned');assert.equal((await stranger.call('claims/'+rival.id)).claim.status,'Rejected');ok('Conflicting approvals are prevented; return needs both confirmations');
await finder.call('claims/'+claim.id,{action:'consent',value:true});assert.equal((await anon.call('stats')).happy.length,0);await owner.call('claims/'+claim.id,{action:'consent',value:true});assert.equal((await anon.call('stats')).happy.length,1);await owner.call('claims/'+claim.id,{action:'consent',value:false});assert.equal((await anon.call('stats')).happy.length,0);ok('Happy Returns requires mutual opt-in and supports consent withdrawal');
const second=await finder.call('reports',{...data,title:'Second found backpack',images:[]});
const rejected=await owner.call('claims',{reportId:second.id,evidence:'My private evidence for this particular backpack.'});await finder.call('claims/'+rejected.id,{action:'reject'});assert.equal((await anon.call('reports/'+second.id)).report.status,'Open');
const withdrawn=await owner.call('claims',{reportId:second.id,evidence:'Another private description with distinguishing details.'});await owner.call('claims/'+withdrawn.id,{action:'withdraw'});assert.equal((await anon.call('reports/'+second.id)).report.status,'Open');ok('Rejected and withdrawn claims reopen listings instead of closing them');
await finder.call('blocks',{userId:oid});await owner.call('claims',{reportId:second.id,evidence:'Blocked evidence long enough for validation.'},'POST',403);await finder.call('blocks',{userId:oid,remove:true});ok('Blocking prevents new claims and can be reversed');
await owner.call('flags',{reportId:second.id,reason:'Please review this demonstration report for the moderation test.'});const flags=(await finder.call('admin')).flags;await finder.call('admin',{id:flags[0].id,action:'hide'});await anon.call('reports/'+second.id,undefined,'GET',404);await finder.call('admin',{id:flags[0].id,action:'restore'});assert.ok((await anon.call('reports/'+second.id)).report);ok('Reported listings can be reviewed, hidden and restored by an admin');
await finder.call('reports/'+second.id,{action:'close'},'PATCH');assert.equal((await anon.call('reports/'+second.id)).report.status,'Closed');await finder.call('reports/'+second.id,undefined,'DELETE');await anon.call('reports/'+second.id,undefined,'GET',404);ok('Report closure and deletion');
const notices=(await owner.call('dashboard')).notifications;assert.ok(notices.some(n=>n.body.includes('match')));assert.ok(notices.some(n=>n.body.includes('message')));await owner.call('notifications',{});assert.ok((await owner.call('dashboard')).notifications.every(n=>n.read));ok('Persistent match, message and claim notifications can be marked read');
const forged=new Request(origin+'/api/save',{method:'POST',headers:{origin:'https://hostile.example',cookie:owner.cookie,'content-type':'application/json'},body:JSON.stringify({reportId:found.id,saved:true})});assert.equal((await api.POST(forged)).status,403);ok('Cross-origin state changes are rejected');
for(let i=0;i<30;i++){const req=new Request(origin+'/api/notifications',{method:'POST',headers:{origin,cookie:stranger.cookie,'content-type':'application/json'},body:'{}'});await api.POST(req);}
await stranger.call('notifications',{},'POST',429);ok('Server-side persistent rate limits are enforced');
fs.writeFileSync(path.join(process.env.DATA_DIR,'assertions.json'),JSON.stringify({cookie:owner.cookie,user:oid,report:found.id,claim:claim.id,image:images[0]}));
console.log(`${checks} workflow groups passed.`);
