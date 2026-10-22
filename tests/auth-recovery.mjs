import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {build} from 'esbuild';
import {isolate} from './environment.mjs';
isolate('auth-recovery');
Object.assign(process.env,{BREVO_API_KEY:'test-only-not-a-real-key',EMAIL_FROM:'operator@example.test'});
await build({entryPoints:['tests/entry.ts'],outfile:'.sites-runtime/auth-entry.mjs',bundle:true,platform:'node',format:'esm',target:'node24',packages:'external',alias:{'cloudflare:workers':path.resolve('local/storage.mjs')}});
const {auth,api,env,drainAuthEmails,sendAuthEmail,authMailSettings}=await import('../.sites-runtime/auth-entry.mjs');
const sent=[],originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.brevo.com/v3/smtp/email');assert.equal(options.headers['api-key'],'test-only-not-a-real-key');sent.push(JSON.parse(options.body));return Response.json({messageId:'test'});};
const origin='http://127.0.0.1:3000',email='member@recovery.test',password=randomBytes(18).toString('base64url');let cookie='',requestNumber=1;
async function call(route,body,expected=200){
  const method=body?'POST':'GET';const response=await auth[method](new Request(origin+'/api/auth/'+route,{method,headers:{origin,'content-type':'application/json','cf-connecting-ip':'192.0.2.'+requestNumber++,cookie},body:body?JSON.stringify(body):undefined}));
  assert.equal(response.status,expected,`${route} unexpected status`);
  for(const value of response.headers.getSetCookie())if(value.startsWith('better-auth.session_token='))cookie=value.split(';')[0];
  return response;
}
const link=mail=>new URL(mail.textContent.match(/https?:\/\/\S+/)[0]);
try{
  await call('sign-up/email',{name:'Recovery Test',email,password,callbackURL:'/?auth=verified'});await drainAuthEmails();
  assert.equal(sent.length,1);assert.equal(sent[0].to[0].email,email);assert.ok(sent[0].subject.startsWith('Verify'));
  assert.equal((await (await call('sign-in/email',{email,password},403)).json()).code,'EMAIL_NOT_VERIFIED');
  const verification=link(sent[0]);const verified=await auth.GET(new Request(verification));assert.equal(verified.status,302);assert.ok(verified.headers.get('location').includes('auth=verified'));
  await call('sign-in/email',{email,password});assert.ok(cookie);
  console.log('PASS verified email required, provider request and real verification callback');
  const oldCookie=cookie;
  const known=await (await call('request-password-reset',{email,redirectTo:'/?auth=reset'})).json();await drainAuthEmails();
  const reset=link(sent.at(-1));const redirect=await auth.GET(new Request(reset));assert.equal(redirect.status,302);
  const token=new URL(redirect.headers.get('location')).searchParams.get('token');assert.ok(token);
  const before=sent.length;const unknown=await (await call('request-password-reset',{email:'unknown@recovery.test',redirectTo:'/?auth=reset'})).json();await drainAuthEmails();
  assert.deepEqual(known,unknown);assert.equal(sent.length,before);
  const nextPassword=randomBytes(18).toString('base64url');await call('reset-password',{token,newPassword:nextPassword});
  const replay=await auth.POST(new Request(origin+'/api/auth/reset-password',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({token,newPassword:password})}));assert.ok(replay.status>=400);
  const me=await api.GET(new Request(origin+'/api/me',{headers:{cookie:oldCookie}}));assert.equal((await me.json()).user,null);
  await call('sign-in/email',{email,password},401);await call('sign-in/email',{email,password:nextPassword});
  console.log('PASS private reset response, one-use token, old-password rejection and session revocation');
  const badRedirect=await auth.POST(new Request(origin+'/api/auth/request-password-reset',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email,redirectTo:'https://untrusted.example/reset'})}));assert.ok(badRedirect.status>=400);await drainAuthEmails();
  await assert.rejects(()=>sendAuthEmail({to:email,name:'Test',url:'https://untrusted.example/api/auth/reset',purpose:'reset'},origin));
  await call('request-password-reset',{email,redirectTo:'/?auth=reset'});await drainAuthEmails();
  const expiredLink=link(sent.at(-1));await env.DB.prepare('UPDATE verification SET expiresAt=?').bind(Date.now()-1000).run();
  const expired=await auth.GET(new Request(expiredLink));assert.ok(expired.status>=300);assert.ok((expired.headers.get('location')||'').includes('error='));
  delete process.env.EMAIL_FROM;assert.throws(()=>authMailSettings(),/Configure/);
  console.log('PASS untrusted redirects, expired links and partial mail configuration rejected');
}finally{globalThis.fetch=originalFetch;}
