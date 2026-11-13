import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {chromium,webkit,expect} from '@playwright/test';
import {isolate} from './environment.mjs';
import {checkAccessibility} from './accessibility.mjs';
isolate('college-browser');
const origin='http://127.0.0.1:3005';Object.assign(process.env,{PORT:'3005',HOST:'127.0.0.1',APP_ORIGIN:origin});
const {server}=await import('../dist/local-server.mjs');
const sql=new DatabaseSync(path.join(process.env.DATA_DIR,'lost-found.sqlite'));
const engine=process.argv.includes('--webkit')?webkit:chromium;
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let browser;
try{
 browser=await engine.launch({headless:true,...(engine===chromium&&process.platform==='win32'&&fs.existsSync(edge)?{executablePath:edge}:{})});
 const contexts=[];
 async function account(name){const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});contexts.push(context);context.setDefaultTimeout(20000);const email=name+'@campus-ui.test';const r=await context.request.post(origin+'/api/auth/sign-up/email',{headers:{origin},data:{name,email,password:randomBytes(24).toString('hex')}});assert.equal(r.status(),200);const user=(await(await context.request.get(origin+'/api/me')).json()).user;sql.prepare('UPDATE user SET emailVerified=1 WHERE id=?').run(user.id);return {context,page:await context.newPage(),user,email};}
 const staff=await account('Staff'),finder=await account('Finder'),owner=await account('Owner');process.env.ADMIN_USER_IDS=staff.user.id;
 async function api(who,route,body){const r=body?await who.context.request.post(origin+'/api/'+route,{headers:{origin},data:body}):await who.context.request.get(origin+'/api/'+route);const d=await r.json();assert.equal(r.status(),200,route+JSON.stringify(d));return d;}
 await staff.page.goto(origin);await staff.page.getByRole('button',{name:'College workspace',exact:true}).click();
 await staff.page.getByText('Create a college',{exact:true}).click();await staff.page.getByLabel('College name',{exact:true}).fill('Campus UI');await staff.page.getByLabel('Verified administrator email').fill(staff.email);await staff.page.getByRole('button',{name:'Create workspace',exact:true}).click();
 await expect(staff.page.getByRole('heading',{name:'Campus UI',exact:true})).toBeVisible();const wid=(await api(staff,'workspaces')).workspaces[0].id;
 await staff.page.getByText('Add a collection desk',{exact:true}).click();await staff.page.getByLabel('Desk name',{exact:true}).fill('Library help desk');await staff.page.getByLabel('Public campus location').fill('Library entrance');await staff.page.getByRole('button',{name:'Add desk',exact:true}).click();await expect(staff.page.getByText('Library help desk',{exact:true}).first()).toBeVisible();
 const desk=(await api(staff,'workspaces/'+wid+'/desks')).desks[0];
 await checkAccessibility(staff.page,'college-dashboard');
 const downloading=staff.page.waitForEvent('download');await staff.page.getByRole('button',{name:'Download printable QR poster'}).click();const download=await downloading;const poster=fs.readFileSync(await download.path(),'utf8');assert.match(poster,/<svg x="147" y="260" width="500" height="500"[^>]*viewBox=/);assert.ok(poster.includes('Campus UI'));
 await api(staff,'workspaces/'+wid+'/members',{email:finder.email,role:'student'});await api(staff,'workspaces/'+wid+'/members',{email:owner.email,role:'student'});
 await finder.page.goto(origin+'/?college='+wid+'&desk='+desk.id+'&reportType=found');let dialog=finder.page.getByRole('dialog');await expect(dialog.getByLabel('Approximate location')).toHaveValue('Library entrance');
 await dialog.getByLabel('Item name').fill('Blue campus umbrella');await dialog.getByRole('button',{name:'Publish report',exact:true}).click();await expect(finder.page.getByRole('heading',{name:'Blue campus umbrella',exact:true})).toBeVisible();const rid=new URL(finder.page.url()).searchParams.get('report');assert.equal((await api(finder,'reports/'+rid)).report.workspaceId,wid);
 await staff.page.getByRole('button',{name:'Refresh workspace'}).click();await staff.page.getByLabel('Found report').selectOption(rid);await staff.page.getByLabel('Collection desk').selectOption(desk.id);await staff.page.getByLabel('Private storage position').fill('Cabinet B');await staff.page.getByRole('button',{name:'Record storage',exact:true}).click();await expect(staff.page.getByLabel('Found report').locator('option:checked')).toContainText('In storage');
 const claim=(await api(owner,'claims',{reportId:rid,evidence:'A silver patch is inside the handle.'})).id;
 await staff.page.getByRole('button',{name:'Refresh workspace'}).click();await staff.page.getByRole('button',{name:'Review private claim',exact:true}).click();await staff.page.getByRole('button',{name:'Approve & arrange return',exact:true}).click();await expect(staff.page.getByRole('heading',{name:'Collect from college staff'})).toBeVisible();
 await owner.page.goto(origin+'/?claim='+claim);await owner.page.getByRole('button',{name:'Get a collection code'}).click();const code=await owner.page.locator('.collection-code').innerText();assert.match(code,/^\d{8}$/);await staff.page.getByLabel('Owner’s 8-digit code').fill(code);await staff.page.getByRole('button',{name:'Verify code and record collection'}).click();await expect(staff.page.getByRole('heading',{name:'A happy return, confirmed.'})).toBeVisible();
 assert.equal((await api(owner,'claims/'+claim)).claim.status,'Returned');
 console.log('PASS '+engine.name()+' college creation, desk, printable poster, QR-prefilled form, staff intake, private approval and one-time collection through the UI');
 // Start an ordinary public report with the app loaded, then lose the connection.
 await finder.page.goto(origin);await finder.page.getByRole('button',{name:'I found something',exact:true}).first().click();dialog=finder.page.getByRole('dialog');await finder.context.setOffline(true);
 await dialog.getByLabel('Item name').fill('Offline yellow backpack');await dialog.getByLabel('Approximate location').fill('East gate');await dialog.locator('input[type=file][multiple]').setInputFiles({name:'offline.png',mimeType:'image/png',buffer:fs.readFileSync('tests/fixtures/sample.png')});await expect(dialog.getByRole('img',{name:'Upload 1',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'Publish report',exact:true}).click();await expect(finder.page.getByRole('region',{name:'Report submission queue'})).toContainText('Saved locally · waiting to upload');
 await finder.context.setOffline(false);const queue=finder.page.getByRole('region',{name:'Report submission queue'});await expect(queue.locator('article').filter({hasText:'Offline yellow backpack'})).toContainText('Successfully submitted');
 assert.equal(sql.prepare("SELECT count(*) AS n FROM reports WHERE title='Offline yellow backpack'").get().n,1);
 const uploaded=sql.prepare("SELECT images FROM reports WHERE title='Offline yellow backpack'").get();assert.match(JSON.parse(uploaded.images)[0],/^\/api\/media\//);
 await finder.page.getByRole('button',{name:'I found something',exact:true}).first().click();await dialog.getByLabel('Item name').fill('Receipt retry notebook');await dialog.getByLabel('Approximate location').fill('West gate');
 let dropped=false;await finder.page.route('**/api/reports',async route=>{if(route.request().method()==='POST'&&!dropped){dropped=true;await route.fetch();await route.abort();}else await route.continue();});await dialog.getByRole('button',{name:'Publish report',exact:true}).click();const retry=queue.locator('article').filter({hasText:'Receipt retry notebook'});await expect(retry).toContainText('Saved locally');await retry.getByRole('button',{name:'Retry upload'}).click();await expect(retry).toContainText('Successfully submitted');assert.equal(sql.prepare("SELECT count(*) AS n FROM reports WHERE title='Receipt retry notebook'").get().n,1);await finder.page.unroute('**/api/reports');
 console.log('PASS '+engine.name()+' offline compressed photo and report queue, reconnect upload, lost-response retry without duplicates');
 await finder.page.getByLabel('Language / भाषा').selectOption('hi');await finder.page.getByRole('button',{name:'मुझे कोई चीज़ मिली',exact:true}).first().click();await expect(dialog.getByRole('heading',{name:'मिली वस्तु की जानकारी दें'})).toBeVisible();await checkAccessibility(finder.page,'hindi-found');await dialog.getByRole('button',{name:'सहेजें और बंद करें'}).click();await finder.page.getByLabel('Language / भाषा').selectOption('mr');await finder.page.reload();await expect(finder.page.getByLabel('Language / भाषा')).toHaveValue('mr');await finder.page.getByRole('button',{name:'मला वस्तू सापडली',exact:true}).first().click();await checkAccessibility(finder.page,'marathi-found');assert.ok(await finder.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 fs.mkdirSync('.sites-runtime/browser',{recursive:true});await finder.page.screenshot({path:'.sites-runtime/browser/college-marathi-'+engine.name()+'.png',fullPage:true});await dialog.getByRole('button',{name:'जतन करून बंद करा'}).click();await finder.page.getByLabel('Language / भाषा').selectOption('en');
 await finder.page.getByRole('button',{name:'Toggle navigation'}).click();await finder.page.getByRole('button',{name:'My dashboard',exact:true}).click();await finder.page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(queue).toHaveCount(0);
 const remaining=await finder.page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('lf-offline-reports-v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction(['reports','photos']),a=tx.objectStore('reports').count(),b=tx.objectStore('photos').count();tx.oncomplete=()=>{resolve(a.result+b.result);db.close();};};r.onerror=reject;}));assert.equal(remaining,0);
 console.log('PASS '+engine.name()+' Hindi/Marathi controls, persisted language, accessibility, narrow-screen layout and sign-out clearing private queued data');
}finally{if(browser)await browser.close();sql.close();await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
