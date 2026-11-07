import assert from 'node:assert/strict';
import {checkAccessibility} from './accessibility.mjs';

// Run on the actual report opened by the publication workflow.
export async function checkReportOptions(page) {
 const original=page.viewportSize();
 const theme=await page.evaluate(()=>document.documentElement.dataset.theme);
 try {
  const options=page.getByRole('region',{name:'Report options',exact:true});
  await options.waitFor();
  for(const width of [320,390,768,1280]) {
   await page.setViewportSize({width,height:900});
   for(const colour of ['light','dark']) {
    await page.evaluate(value=>document.documentElement.dataset.theme=value,colour);
    const boxes=await options.locator('button').evaluateAll(buttons=>buttons.map(button=>{
     const r=button.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};
    }));
    assert.ok(boxes.length>=4,'All existing report actions remain available');
    for(let i=0;i<boxes.length;i++) {
     assert.ok(boxes[i].height>=44,'Action must have a comfortable touch target');
     assert.ok(Math.abs(boxes[i].x-boxes[0].x)<1&&Math.abs(boxes[i].width-boxes[0].width)<1,'Actions share one column');
     if(i)assert.ok(boxes[i].y>=boxes[i-1].y+boxes[i-1].height+7,'Actions do not overlap');
    }
    assert.ok(await page.getByRole('dialog').evaluate(d=>d.scrollWidth<=d.clientWidth+1),'No sideways scrolling');
    if(width===390||width===1280)await checkAccessibility(page,'report-options-'+width+'-'+colour);
    if(width===390){await options.scrollIntoViewIfNeeded();await page.screenshot({path:'.sites-runtime/browser/report-options-'+colour+'.png'});}
   }
  }
  // Reordering must preserve the original save and download behavior.
  await options.getByRole('button',{name:'Save',exact:true}).click();
  await options.getByRole('button',{name:'Saved',exact:true}).waitFor();
  await options.getByRole('button',{name:'Saved',exact:true}).click();
  await options.getByRole('button',{name:'Save',exact:true}).waitFor();
  const downloaded=page.waitForEvent('download');
  await options.getByRole('button',{name:'QR code',exact:true}).click();
  assert.match((await downloaded).suggestedFilename(),/^lost-found-.+\.png$/);
  await options.getByRole('button',{name:'Report listing',exact:true}).click();
  await page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Help keep the community safe.',exact:true})}).waitFor();
  await page.keyboard.press('Escape');
  await options.getByRole('button',{name:'Save',exact:true}).focus();
  await page.keyboard.press('Tab');
  assert.ok(await options.getByRole('button',{name:'Copy link',exact:true}).evaluate(b=>b===document.activeElement),'Keyboard follows the visual action order');
  console.log('PASS published-report single-column actions, touch sizes, both themes, save, QR download, safety dialog and keyboard order');
 } finally {
  await page.setViewportSize(original);
  await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);
 }
}
