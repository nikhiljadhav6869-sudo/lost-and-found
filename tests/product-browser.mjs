import assert from 'node:assert/strict';
import fs from 'node:fs';
export async function checkProductReporting(page){
 await page.goto('http://127.0.0.1:3002');await page.locator('.avatar').waitFor();
 await page.getByRole('button',{name:'I lost something',exact:true}).first().click();const d=page.getByRole('dialog');
 await d.getByRole('button',{name:"I Don't Have a Photo",exact:true}).click();
 assert.equal(await d.getByRole('button',{name:/Extract Product/}).count(),0);
 const unwanted=[];const observe=r=>{if(/product-extract|photo-suggestions/.test(r.url()))unwanted.push(r.url());};page.on('request',observe);
 await d.getByLabel('Product link (optional)').fill('https://any-shopping-app.example/items/headphones');
 await d.locator('.upload-zone input').setInputFiles({name:'reference-from-any-shop.jpg',mimeType:'image/jpeg',buffer:fs.readFileSync(new URL('fixtures/sample.jpg',import.meta.url))});
 await d.getByAltText('Upload 1').waitFor();await d.getByText('Reference Product Image — not a photo of the actual lost item.',{exact:true}).waitFor();
 assert.equal(await d.getByRole('region',{name:'AI photo suggestions'}).count(),0);
 assert.equal(await d.getByLabel('Item name').inputValue(),'');
 assert.equal((await page.request.post('http://127.0.0.1:3002/api/product-extract',{headers:{origin:'http://127.0.0.1:3002'},data:{website:'Other Website',url:'https://any-shopping-app.example/item'}})).status(),410);
 await d.getByLabel('Item name').fill('Manual product reference headphones');await d.getByLabel('Approximate location').fill('College library');await d.getByLabel('Public description',{exact:true}).fill('Blue headphones with folding arms and padded ear cups.');
 await d.getByLabel('Product model (optional)').fill('H1');await d.getByLabel('What makes your product unique?').fill('Private scratch beside the charging port.');
 await d.getByRole('button',{name:'Save & close',exact:true}).click();
 await page.getByRole('button',{name:'I lost something',exact:true}).first().click();
 assert.equal(await d.getByLabel('Product link (optional)').inputValue(),'https://any-shopping-app.example/items/headphones');
 assert.equal(await d.getByLabel('Product model (optional)').inputValue(),'H1');
 await d.getByRole('button',{name:'Review report',exact:true}).click();await d.getByRole('heading',{name:'Review your lost-item report'}).waitFor();
 await d.getByRole('button',{name:'Confirm & publish report'}).click();await page.getByRole('heading',{name:'Manual product reference headphones',exact:true}).waitFor();const id=new URL(page.url()).searchParams.get('report');assert.ok(id);
 const report=await(await page.request.get('http://127.0.0.1:3002/api/reports/'+id)).json();assert.equal(report.report.productData.model,'H1');assert.equal(report.report.privateDetails,undefined);assert.equal(report.report.referenceImage,1);assert.equal(report.report.images.length,1);assert.equal(report.report.productData.product_url,'https://any-shopping-app.example/items/headphones');assert.equal(report.report.description,'Blue headphones with folding arms and padded ear cups.');assert.deepEqual(unwanted,[]);page.off('request',observe);
 await page.getByRole('region',{name:'Report options'}).getByRole('button',{name:'Delete report',exact:true}).click();await page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'Delete this report?'})}).getByRole('button',{name:'Delete report',exact:true}).click();await page.getByText('Report deleted.',{exact:true}).waitFor();assert.equal((await page.request.get('http://127.0.0.1:3002/api/reports/'+id)).status(),404);
 console.log('PASS any-store reference screenshot, no extraction or photo AI, manual details, draft recovery, review, publication and deletion');
}
