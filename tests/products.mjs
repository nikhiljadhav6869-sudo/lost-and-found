import assert from 'node:assert/strict';
import {productURL,canonicalProductURL,manualProductReference} from '../lib/product-data.ts';
for(const value of ['http://example.com/p','https://user:password@example.com/p','https://127.0.0.1/p','https://[::1]/p','https://example.local/p','https://example.com:444/p'])assert.throws(()=>productURL(value));
const data={title:'My headphones',brand:'Manual brand',colour:'Blue',description:'My manually written description.',productData:{model:'H1'}};
assert.equal(manualProductReference(data).product_url,'');
for(const productLink of ['https://www.amazon.in/dp/B012345678','https://www.flipkart.com/item/p/item123?pid=ABCDEFGHIJKL','https://any-shopping-site.example/products/headphones']){
 const reference=manualProductReference({...data,productLink});assert.equal(reference.product_name,data.title);assert.equal(reference.brand,data.brand);assert.equal(reference.model,'H1');assert.equal(reference.product_image,'');assert.equal(reference.product_url,canonicalProductURL(productLink));
}
const saved={...data,productData:{...manualProductReference({...data,productLink:'https://any-shopping-site.example/item'}),model:'H2'}};
assert.equal(manualProductReference(saved).product_url,'https://any-shopping-site.example/item');
assert.equal(manualProductReference({...saved,productLink:''}).product_url,'');
assert.throws(()=>manualProductReference({...data,productLink:'javascript:alert(1)'}));
console.log('PASS manual product references: optional links, any shop, editable model, existing links and unsafe URL rejection');
