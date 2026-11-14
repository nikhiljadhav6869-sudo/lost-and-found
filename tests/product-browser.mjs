import assert from 'node:assert/strict';
export async function checkProductReporting(page){
 await page.goto('http://127.0.0.1:3002');await page.locator('.avatar').waitFor();
 await page.getByRole('button',{name:'I lost something',exact:true}).first().click();const d=page.getByRole('dialog');
 await d.getByRole('button',{name:"I Don't Have a Photo",exact:true}).click();
 await d.getByLabel('Product link (optional)').fill('https://www.amazon.in/dp/B012345678');
 await d.getByRole('button',{name:'Extract Product Details Using AI'}).click();
 await d.getByRole('alert').filter({hasText:'not configured'}).waitFor();assert.equal(await d.getByLabel('Product link (optional)').inputValue(),'https://www.amazon.in/dp/B012345678');
 await d.getByRole('button',{name:"I Don't Have a Product Link"}).click();
 await d.getByLabel('Item name').fill('Manual product reference headphones');await d.getByLabel('Approximate location').fill('College library');await d.getByLabel('Public description',{exact:true}).fill('Blue headphones with folding arms and padded ear cups.');
 await d.getByLabel('Product model (optional)').fill('H1');await d.getByLabel('What makes your product unique?').fill('Private scratch beside the charging port.');
 await d.getByRole('button',{name:'Review report',exact:true}).click();await d.getByRole('heading',{name:'Review your lost-item report'}).waitFor();
 await d.getByRole('button',{name:'Confirm & publish report'}).click();await page.getByRole('heading',{name:'Manual product reference headphones',exact:true}).waitFor();const id=new URL(page.url()).searchParams.get('report');assert.ok(id);
 const report=await(await page.request.get('http://127.0.0.1:3002/api/reports/'+id)).json();assert.equal(report.report.productData.model,'H1');assert.equal(report.report.privateDetails,undefined);
 await page.getByRole('region',{name:'Report options'}).getByRole('button',{name:'Delete report',exact:true}).click();await page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Delete this report?'})}).getByRole('button',{name:'Delete report',exact:true}).click();await page.getByText('Report deleted.',{exact:true}).waitFor();assert.equal((await page.request.get('http://127.0.0.1:3002/api/reports/'+id)).status(),404);
 console.log('PASS photo-free product form, unconfigured-provider fallback, private unique details, review, publication and owner deletion');
}
