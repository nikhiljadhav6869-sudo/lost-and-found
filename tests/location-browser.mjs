import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {checkAccessibility} from './accessibility.mjs';
export async function checkLocation(browser,origin) {
 const context=await browser.newContext({viewport:{width:390,height:844},permissions:['geolocation'],geolocation:{latitude:18.520430,longitude:73.856743,accuracy:30}});
 context.setDefaultTimeout(20000);
 try {
  await context.addInitScript(()=>{
   window.locationCalls=0;
   const original=navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
   navigator.geolocation.getCurrentPosition=(...args)=>{window.locationCalls++;return original(...args);};
  });
  const signup=await context.request.post(origin+'/api/auth/sign-up/email',{headers:{origin},data:{name:'Location Tester',email:'location@ui.test',password:randomBytes(24).toString('hex')}});
  assert.equal(signup.status(),200);
  const page=await context.newPage();await page.goto(origin);await page.waitForFunction(()=>!!document.querySelector('.avatar'));
  const dialog=page.getByRole('dialog'),input=dialog.getByLabel('Approximate location');
  for(const type of ['found','lost']) {
   await page.getByRole('button',{name:`I ${type} something`,exact:true}).first().click();
   assert.equal(await page.evaluate(()=>window.locationCalls),0,'No location access before a click');
   await dialog.getByRole('button',{name:'Use current location',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('.report-location input')?.value==='Near 18.520, 73.857');
   const href=await dialog.getByRole('link',{name:'Check on Google Maps'}).getAttribute('href');
   assert.equal(new URL(href).origin,'https://www.google.com');assert.equal(new URL(href).searchParams.get('query'),'18.52,73.857');
   const saved=await page.evaluate(()=>JSON.stringify(Object.entries(localStorage).filter(([k])=>k.startsWith('lf-report-draft-v2:'))));
   assert.ok(saved.includes('Near 18.520, 73.857'));assert.ok(!saved.includes('18.52043'));assert.ok(!saved.includes('73.856743'));
   await checkAccessibility(page,'location-'+type);
   await page.screenshot({path:'.sites-runtime/browser/location-'+type+'.png'});
   await page.reload();await page.getByRole('heading',{name:`Report a ${type} item`,exact:true}).waitFor();
   assert.equal(await input.inputValue(),'Near 18.520, 73.857');assert.equal(await page.evaluate(()=>window.locationCalls),0);
   await dialog.getByRole('button',{name:'Save & close',exact:true}).click();
  }
  await page.getByRole('button',{name:'I found something',exact:true}).first().click();
  await input.fill('Library courtyard');
  for(const [code,text] of [[1,'Location access was not allowed.'],[2,'Your phone could not find its location.'],[3,'Finding your location took too long.']]) {
   await page.evaluate(code=>{navigator.geolocation.getCurrentPosition=(success,failure)=>failure({code});},code);
   await dialog.getByRole('button',{name:'Use current location',exact:true}).click();
   await dialog.getByRole('alert').filter({hasText:text}).waitFor();
   assert.equal(await input.inputValue(),'Library courtyard');
  }
  await page.evaluate(()=>{navigator.geolocation.getCurrentPosition=success=>{window.delayedLocation=success;};});
  await dialog.getByRole('button',{name:'Use current location',exact:true}).click();
  await input.fill('Manually corrected location');
  await page.evaluate(()=>window.delayedLocation({coords:{latitude:20,longitude:70,accuracy:20}}));
  assert.equal(await input.inputValue(),'Manually corrected location','A late location result must not overwrite manual edits');
  await dialog.getByRole('button',{name:'Use current location',exact:true}).click();
  await dialog.getByRole('button',{name:'Save & close',exact:true}).click();
  await page.evaluate(()=>window.delayedLocation({coords:{latitude:20,longitude:70,accuracy:20}}));
  await page.getByRole('button',{name:'Use dark theme'}).click();
  await page.getByRole('button',{name:'I found something',exact:true}).first().click();
  assert.equal(await input.inputValue(),'Manually corrected location');
  await checkAccessibility(page,'location-dark');
  console.log('PASS lost/found location access only on click, Google Maps links, rounded draft recovery, permission errors and stale-result protection');
 }finally{await context.close();}
}
