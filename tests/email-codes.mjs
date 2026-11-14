import {isolate} from './environment.mjs';isolate('email-codes');
Object.assign(process.env,{AUTH_EMAIL_CODES:'true',BREVO_API_KEY:'test-only-key',EMAIL_FROM:'sender@example.test'});
import {build} from 'esbuild';import path from 'node:path';import assert from 'node:assert/strict';
await build({entryPoints:['tests/entry.ts'],outfile:'.sites-runtime/email-codes-entry.mjs',bundle:true,platform:'node',format:'esm',target:'node24',packages:'external',alias:{'cloudflare:workers':path.resolve('local/storage.mjs')}});
const {auth,api,env}=await import('../.sites-runtime/email-codes-entry.mjs');const realFetch=globalThis.fetch,sent=[];
globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.brevo.com/v3/smtp/email');sent.push(JSON.parse(options.body));return Response.json({messageId:'test-message'});};
const origin='http://localhost:3000',email='otp-user@example.test';
let requestNumber=0;
// Distinct test client IPs keep native IP throttling separate from account/code budgets.
class Client{cookies=new Map();async call(route,body){const response=await auth.POST(new Request(origin+'/api/auth/'+route,{method:'POST',headers:{origin,'cf-connecting-ip':'192.0.2.'+(++requestNumber),'content-type':'application/json',cookie:[...this.cookies].map(([k,v])=>k+'='+v).join('; ')},body:JSON.stringify(body)}));for(const value of response.headers.getSetCookie()){const pair=value.split(';')[0],i=pair.indexOf('=');this.cookies.set(pair.slice(0,i),pair.slice(i+1));}return response;}async app(route){return api.GET(new Request(origin+'/api/'+route,{headers:{cookie:[...this.cookies].map(([k,v])=>k+'='+v).join('; ')}}));}}
const code=()=>sent.at(-1).textContent.match(/\b\d{6}\b/)[0];const a=new Client(),b=new Client();
try{
 assert.equal((await a.call('sign-up/email',{email,password:'not-used-password'})).status,403);
 assert.equal((await a.call('sign-in/email',{email,password:'not-used-password'})).status,403);
 assert.equal((await a.call('email-otp/send-verification-otp',{email,type:'sign-in'})).status,200);const first=code();
 assert.equal((await a.app('dashboard')).status,401);assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM user').first()).n,0);
 const stored=JSON.stringify((await env.DB.prepare('SELECT value FROM verification').all()).results);assert.ok(!stored.includes(first));
 assert.equal((await a.call('email-otp/send-verification-otp',{email,type:'sign-in'})).status,429);
 assert.ok((await a.call('sign-in/email-otp',{email,otp:first==='000000'?'111111':'000000'})).status>=400);
 const verified=await a.call('sign-in/email-otp',{email,otp:first,name:'Email Code User'});assert.equal(verified.status,200);assert.ok(verified.headers.getSetCookie().some(v=>v.includes('Max-Age=31536000')));
 assert.equal((await a.app('dashboard')).status,200);const me=await(await a.app('me')).json();assert.ok(me.user.emailVerified);assert.equal(me.user.name,'Email Code User');
 assert.ok((await b.call('sign-in/email-otp',{email,otp:first})).status>=400);
 const persisted=new Client();persisted.cookies=new Map(a.cookies);assert.equal((await persisted.app('dashboard')).status,200);
 await a.call('sign-out',{});assert.equal((await persisted.app('dashboard')).status,401);
 await env.DB.prepare('DELETE FROM limits').run();assert.equal((await b.call('email-otp/send-verification-otp',{email,type:'sign-in'})).status,200);const second=code();assert.equal((await b.call('sign-in/email-otp',{email,otp:second})).status,200);assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM user').first()).n,1);
 await b.call('sign-out',{});await env.DB.prepare('DELETE FROM limits').run();await b.call('email-otp/send-verification-otp',{email,type:'sign-in'});const expired=code();await env.DB.prepare('UPDATE verification SET expiresAt=?').bind(Date.now()-1000).run();assert.ok((await b.call('sign-in/email-otp',{email,otp:expired})).status>=400);
 await env.DB.prepare('DELETE FROM limits').run();await b.call('email-otp/send-verification-otp',{email,type:'sign-in'});const limited=code();for(let i=0;i<5;i++)assert.ok((await b.call('sign-in/email-otp',{email,otp:limited==='000000'?'111111':'000000'})).status>=400);assert.ok((await b.call('sign-in/email-otp',{email,otp:limited})).status>=400);
 const csrf=await auth.POST(new Request(origin+'/api/auth/email-otp/send-verification-otp',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:JSON.stringify({email,type:'sign-in'})}));assert.equal(csrf.status,403);
 console.log('PASS real passwordless account creation/login, hashed OTPs, expiry, replay, attempt and resend limits, no pre-verification access, persistent sessions, logout and origin checks');
}finally{globalThis.fetch=realFetch;}
