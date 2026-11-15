import {chromium,webkit} from '@playwright/test';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const origin='http://127.0.0.1:3007';
const engine=process.argv.includes('--webkit')?webkit:chromium;
fs.mkdirSync('.sites-runtime',{recursive:true});
const profile=fs.mkdtempSync(path.resolve('.sites-runtime','login-profile-'+engine.name()+'-'));
const server=spawn(process.execPath,['tests/email-browser-server.mjs'],{stdio:['ignore','pipe','pipe']});
let output='',context;
server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
async function open(){
 context=await engine.launchPersistentContext(profile,{headless:true,viewport:{width:390,height:844},...(engine===chromium&&process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
 const page=context.pages()[0]||await context.newPage();page.setDefaultTimeout(30000);return page;
}
try{
 for(let i=0;i<300&&!output.includes('Lost & Found running');i++){if(server.exitCode!==null)throw Error('Test server stopped');await new Promise(r=>setTimeout(r,100));}
 assert.ok(output.includes('Lost & Found running'));
 let page=await open();await page.goto(origin);
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Create an account',exact:true}).click();
 const d=page.getByRole('dialog');await d.getByLabel('Your name').fill('Code Tester');await d.getByLabel('Email',{exact:true}).fill('code-browser@ui.test');
 await page.getByText('Use your own email address.',{exact:false}).waitFor();assert.equal(await d.locator('input[type=password]').count(),0);
 await d.getByRole('button',{name:'Send verification code',exact:true}).click();await d.getByLabel('Email verification code').waitFor();
 await d.getByLabel('Email verification code').fill(JSON.parse(fs.readFileSync('.sites-runtime/email-browser-code.json')).code);
 await d.getByRole('button',{name:'Verify code',exact:true}).click();await page.locator('.avatar').waitFor();
 const initial=(await context.cookies()).find(c=>c.name.includes('session_token'));
 assert.ok(initial&&initial.expires>Date.now()/1000+300*86400&&initial.httpOnly);
 await page.reload();await page.locator('.avatar').waitFor();assert.equal(await page.getByRole('dialog').count(),0);
 // Close the entire browser process. Reuse only its disk profile, never copied cookies.
 await context.close();context=null;
 page=await open();await page.goto(origin);await page.locator('.avatar').waitFor();
 assert.equal(await page.getByRole('dialog').count(),0);
 assert.equal((await context.cookies()).find(c=>c.name===initial.name)?.value,initial.value);
 assert.equal((await page.request.get(origin+'/api/dashboard')).status(),200);
 // A temporary server outage must not erase the persistent login.
 // Simulate a failed fetch at the page boundary. WebKit's restored service worker
 // can bypass Playwright routing, so request routing is not a reliable outage here.
 await page.addInitScript(()=>{
  window.testSessionOutage=true;
  const request=window.fetch.bind(window);
  window.fetch=(input,init)=>{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
   if(window.testSessionOutage&&url.origin===location.origin&&url.pathname==='/api/me')return Promise.resolve(new Response('{}',{status:503,headers:{'Content-Type':'application/json'}}));
   return request(input,init);
  };
 });
 await page.reload();await page.getByRole('button',{name:'Retry connection',exact:true}).first().waitFor();
 assert.equal((await context.cookies()).find(c=>c.name===initial.name)?.value,initial.value);
 await page.evaluate(()=>{window.testSessionOutage=false;});await page.getByRole('button',{name:'Retry connection',exact:true}).first().click();await page.locator('.avatar').waitFor();
 await page.locator('.avatar').click();await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();
 await context.close();context=null;
 page=await open();await page.goto(origin);await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();
 assert.equal(await page.locator('.avatar').count(),0);assert.equal((await page.request.get(origin+'/api/dashboard')).status(),401);
 assert.ok(!(await context.cookies()).some(c=>c.name===initial.name&&c.value));
 console.log('PASS '+engine.name()+' OTP signup, full browser close/reopen with disk profile, outage recovery, persistent cookie and logout remaining effective after restart');
}finally{if(context)await context.close();server.kill();}
