import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {checkAccessibility} from './accessibility.mjs';
import {photoOfSize} from './large-photo.mjs';
import {MAX_PHOTO_BYTES} from '../lib/photo-limits.mjs';

export async function checkQuickFound(browser,origin){
 const context=await browser.newContext({viewport:{width:375,height:844},colorScheme:'dark'});
 context.setDefaultTimeout(25000);
 try{
  const page=await context.newPage();
  const password=randomBytes(24).toString('hex'),email='quick-finder@ui.test';
  assert.equal((await context.request.post(origin+'/api/auth/sign-up/email',{headers:{origin},data:{name:'Quick Finder',email,password}})).status(),200);
  await context.clearCookies();
  await page.goto(origin);
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  await page.getByRole('button',{name:'Use light theme'}).click();
  await page.reload();
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await page.getByRole('button',{name:'Use dark theme'}).click();
  await page.getByRole('button',{name:'I found something',exact:true}).first().click();
  let dialog=page.getByRole('dialog');
  await dialog.getByLabel('Email',{exact:true}).fill(email);
  await dialog.getByLabel('Password',{exact:false}).fill(password);
  await dialog.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('heading',{name:'Report a found item',exact:true}).waitFor();
  await checkAccessibility(page,'quick-found-dark');
  assert.equal(await dialog.locator('input:required:visible,textarea:required:visible').count(),2);
  await dialog.getByLabel('Item name').fill('Small striped umbrella');
  await dialog.getByLabel('Approximate location').fill('Campus cafe');
  await page.screenshot({path:'.sites-runtime/browser/quick-found-dark.png',fullPage:true});
  await dialog.getByRole('button',{name:'Publish report',exact:true}).click();
  await page.getByRole('heading',{name:'Small striped umbrella',exact:true}).waitFor();
  const reportId=new URL(page.url()).searchParams.get('report');
  const report=(await (await context.request.get(origin+'/api/reports/'+reportId)).json()).report;
  assert.equal(report.description,'');assert.equal(report.type,'found');assert.equal(report.location,'Campus cafe');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'I found something',exact:true}).first().click();
  // Exercise a real 15 MB original through the mobile photo preparation path.
  await dialog.locator('input[type=file]').setInputFiles({name:'large.jpg',mimeType:'image/jpeg',buffer:photoOfSize(MAX_PHOTO_BYTES)});
  await dialog.getByRole('img',{name:'Upload 1',exact:true}).waitFor();
  await dialog.locator('input[type=file]').setInputFiles({name:'too-large.jpg',mimeType:'image/jpeg',buffer:photoOfSize(MAX_PHOTO_BYTES+1)});
  await dialog.getByRole('alert').filter({hasText:'Each original image must be 15 MB or smaller.'}).waitFor();
  assert.equal(await dialog.getByRole('img',{name:/Upload \d/}).count(),1);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Use light theme'}).click();
  await page.getByRole('button',{name:'I found something',exact:true}).first().click();
  await checkAccessibility(page,'quick-found-light');
  await page.screenshot({path:'.sites-runtime/browser/quick-found-light.png',fullPage:true});
  console.log('PASS quick found report after sign-in, optional description, saved theme, and 15 MB photo boundary');
 }finally{await context.close();}
}
