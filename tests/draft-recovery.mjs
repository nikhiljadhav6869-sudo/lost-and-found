import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';

export async function checkDraftRecovery(browser,origin) {
 const context=await browser.newContext({viewport:{width:390,height:844}});
 context.setDefaultTimeout(25000);
 const password=randomBytes(24).toString('hex'),email='draft-recovery@ui.test';
 let page=await context.newPage();
 const open=async()=>{await page.goto(origin);await page.waitForFunction(()=>!!document.querySelector('.avatar'));};
 const dialog=()=>page.getByRole('dialog');
 const storage=()=>page.evaluate(()=>Object.entries(localStorage).filter(([key])=>key.startsWith('lf-report-draft-v2:')));
 try {
  const signup=await context.request.post(origin+'/api/auth/sign-up/email',{headers:{origin},data:{name:'Draft Recovery',email,password}});
  assert.equal(signup.status(),200);
  for(const type of ['lost','found']) {
   await open();
   await page.getByRole('button',{name:`I ${type} something`,exact:true}).first().click();
   await dialog().getByLabel('Item name').fill(type+' camera-switch backpack');
   await dialog().getByLabel('Approximate location').fill('Public library');
   await dialog().getByLabel('Category').selectOption('Bags');
   await dialog().getByText('Add more details (optional)',{exact:true}).click();
   await dialog().getByLabel('Public description').fill('Canvas backpack with green shoulder straps.');
   await dialog().getByLabel('Colour',{exact:true}).fill('Green');
   await dialog().getByLabel('Brand (optional)').fill('Field');
   await dialog().getByLabel('Date '+type).fill('2026-10-08');
   await dialog().getByLabel('Private distinguishing features').fill('Private orange stitching inside');
   await dialog().locator('input[type=file]').setInputFiles('public/icons/icon-192.png');
   await dialog().getByRole('img',{name:'Upload 1',exact:true}).waitFor();
   const image=await dialog().getByRole('img',{name:'Upload 1',exact:true}).getAttribute('src');
   // No debounce or save click: navigate away immediately after typing the last field.
   await dialog().getByLabel('Item name').fill(type+' latest camera draft');
   await page.goto('about:blank');await open();
   await page.getByRole('heading',{name:`Report a ${type} item`,exact:true}).waitFor();
   assert.equal(await dialog().getByLabel('Item name').inputValue(),type+' latest camera draft');
   assert.equal(await dialog().getByLabel('Approximate location').inputValue(),'Public library');
   assert.equal(await dialog().getByLabel('Category').inputValue(),'Bags');
   await dialog().getByText('Add more details (optional)',{exact:true}).click();
   for(const [label,value] of [['Public description','Canvas backpack with green shoulder straps.'],['Colour','Green'],['Brand (optional)','Field'],['Date '+type,'2026-10-08'],['Private distinguishing features','Private orange stitching inside']])assert.equal(await dialog().getByLabel(label).inputValue(),value);
   assert.equal(await dialog().getByRole('img',{name:'Upload 1',exact:true}).getAttribute('src'),image);
   await dialog().locator('input[type=file]').setInputFiles([]);
   assert.equal(await dialog().getByLabel('Item name').inputValue(),type+' latest camera draft');
   // A fresh tab represents reopening after the phone discards the original page.
   await page.close();page=await context.newPage();await open();
   await page.getByRole('heading',{name:`Report a ${type} item`,exact:true}).waitFor();
   assert.equal(await dialog().getByLabel('Item name').inputValue(),type+' latest camera draft');
   await dialog().getByRole('button',{name:'Save & close',exact:true}).click();
   await page.getByRole('button',{name:`I ${type} something`,exact:true}).first().click();
   assert.equal(await dialog().getByLabel('Private distinguishing features').inputValue(),'Private orange stitching inside');
   await dialog().getByText('Draft options & similar reports',{exact:true}).click();
   await dialog().getByRole('button',{name:'Discard draft',exact:true}).click();
   assert.equal((await storage()).length,0);
   await page.reload();assert.equal(await dialog().count(),0);
  }
  console.log('PASS lost/found drafts recover all fields and ready photos after navigation, reload, camera cancellation and a fresh tab; explicit discard clears them');

  const original={type:'found',title:'Original editable bag',category:'Bags',description:'',colour:'',brand:'',date:'2026-10-08',location:'Campus library',privateDetails:'Original private note',images:[]};
  const created=await context.request.post(origin+'/api/reports',{headers:{origin},data:original});assert.equal(created.status(),200);
  const reportId=(await created.json()).id;
  await page.locator('.avatar').click();await page.getByRole('button',{name:'Edit',exact:true}).click();
  await dialog().getByLabel('Item name').fill('Recovered edited bag');
  await dialog().getByLabel('Private distinguishing features').fill('Edited private note');
  await page.reload();await page.getByRole('heading',{name:'Edit report',exact:true}).waitFor();
  assert.equal(await dialog().getByLabel('Item name').inputValue(),'Recovered edited bag');
  assert.equal(await dialog().getByLabel('Private distinguishing features').inputValue(),'Edited private note');
  await dialog().getByRole('button',{name:'Save changes',exact:true}).click();
  await page.getByRole('heading',{name:'Recovered edited bag',exact:true}).waitFor();
  assert.equal((await storage()).length,0);
  assert.equal((await (await context.request.get(origin+'/api/reports/'+reportId)).json()).report.title,'Recovered edited bag');
  await page.keyboard.press('Escape');await open();
  console.log('PASS edits recover after reload and saving updates the original report and clears its draft');

  await page.getByRole('button',{name:'I found something',exact:true}).first().click();
  await dialog().getByLabel('Item name').fill('Account A private draft');
  await context.clearCookies();
  const other=await context.request.post(origin+'/api/auth/sign-up/email',{headers:{origin},data:{name:'Other Draft User',email:'other-draft@ui.test',password}});
  assert.equal(other.status(),200);await open();assert.equal(await dialog().count(),0);
  await page.getByRole('button',{name:'I found something',exact:true}).first().click();
  assert.equal(await dialog().getByLabel('Item name').inputValue(),'');
  await dialog().getByLabel('Item name').fill('Account B draft');
  await dialog().getByRole('button',{name:'Save & close',exact:true}).click();
  await page.locator('.avatar').click();await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByRole('button',{name:'Sign in',exact:true}).first().waitFor();
  assert.equal((await storage()).length,1,'Signing out removes only the current account drafts');
  const login=await context.request.post(origin+'/api/auth/sign-in/email',{headers:{origin},data:{email,password}});assert.equal(login.status(),200);
  await open();await page.getByRole('heading',{name:'Report a found item',exact:true}).waitFor();
  assert.equal(await dialog().getByLabel('Item name').inputValue(),'Account A private draft');
  await dialog().getByRole('button',{name:'Save & close',exact:true}).click();
  await page.locator('.avatar').click();await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByRole('button',{name:'Sign in',exact:true}).first().waitFor();
  assert.equal((await storage()).length,0);
  console.log('PASS drafts are account-specific and sign-out removes private local notes');
  await context.request.post(origin+'/api/auth/sign-in/email',{headers:{origin},data:{email,password}});
  await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Storage full','QuotaExceededError');};});
  await open();await page.getByRole('button',{name:'I found something',exact:true}).first().click();
  await dialog().getByLabel('Item name').fill('Unsaved warning example');
  await dialog().getByRole('alert').filter({hasText:'Draft could not be saved on this device.'}).waitFor();
  assert.equal(await dialog().getByLabel('Item name').inputValue(),'Unsaved warning example');
  console.log('PASS unavailable storage shows a warning and leaves the typed information in the form');
 } finally {await context.close();}
}
