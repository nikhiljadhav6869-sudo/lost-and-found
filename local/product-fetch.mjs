import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {productURL,normalizeProduct,structuredProduct} from '../lib/product-data.ts';

// Resolve once and pin the public IPv4 address to the TLS connection. Do not
// follow redirects, send browser cookies, or allow arbitrary network targets.
export function publicIPv4(address){
 if(isIP(address)!==4)return false;
 const [a,b,c]=address.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
}
export async function safeProductRequest(raw,{hosts,method='GET',headers={},body,maxBytes=1024*1024}={}){
 const u=productURL(raw);if(!hosts?.includes(u.hostname))throw Error('Product host is not approved.');
 const addresses=await lookup(u.hostname,{all:true,family:4});
 if(!addresses.length||addresses.some(x=>!publicIPv4(x.address)))throw Error('Product host does not resolve to a permitted public address.');
 return new Promise((resolve,reject)=>{
  const req=https.request(u,{method,agent:false,headers:{'User-Agent':'LostFound-ProductMetadata/1.0','Accept-Encoding':'identity',...headers},lookup:(_host,options,done)=>{const entry=addresses[0];options?.all?done(null,[entry]):done(null,entry.address,4);}},res=>{
   if(res.statusCode!==200){res.resume();reject(Error(res.statusCode===429?'The catalog is busy. Wait before trying again.':'The product provider did not allow retrieval. Use manual entry or a screenshot.'));return;}
   const chunks=[];let size=0;res.on('data',b=>{size+=b.length;if(size>maxBytes){req.destroy(Error('Product response exceeds the safe size limit.'));return;}chunks.push(b);});res.on('end',()=>resolve({bytes:Buffer.concat(chunks),type:String(res.headers['content-type']||'')}));res.on('error',reject);
  });
  const timer=setTimeout(()=>req.destroy(Error('Product retrieval timed out. Try again or enter details manually.')),10000);req.on('close',()=>clearTimeout(timer));req.on('error',()=>reject(Error('Product retrieval failed. Try again or enter details manually.')));if(body)req.write(body);req.end();
 });
}
export async function extractCatalogProduct(input,{config=process.env,request=safeProductRequest}={}){
 const u=productURL(input.url),amazon=['amazon.in','www.amazon.in','amazon.com','www.amazon.com'],flipkart=['flipkart.com','www.flipkart.com'];
 const actual=amazon.includes(u.hostname)?'Amazon':flipkart.includes(u.hostname)?'Flipkart':'Other Website';
 if(actual!==input.website)throw Error('Choose the shopping website matching this product link.');
 let product,imageHosts=[],imageReuse=false;
 const json=async(url,options)=>{const response=await request(url,options);try{return JSON.parse(response.bytes.toString('utf8'));}catch{throw Error('The provider returned invalid product data. Use manual entry.');}};
 if(actual==='Amazon'){
  const asin=u.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/)?.[1];if(!asin)throw Error('Use the full Amazon product link containing /dp/ and its product ID, not a shortened or account link.');
  if(config.AMAZON_CATALOG_REUSE_APPROVED!=='true'||!config.AMAZON_CREATORS_CLIENT_ID||!config.AMAZON_CREATORS_CLIENT_SECRET||!config.AMAZON_PARTNER_TAG)throw Error('Amazon extraction is not configured with approved catalog access. Keep this link and enter details manually or upload a permitted screenshot.');
  const host=u.hostname.endsWith('.in')?'www.amazon.in':'www.amazon.com';
  const authHost=host.endsWith('.in')?'api.amazon.co.uk':'api.amazon.com';
  const token=await json('https://'+authHost+'/auth/o2/token',{hosts:[authHost],method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grant_type:'client_credentials',client_id:config.AMAZON_CREATORS_CLIENT_ID,client_secret:config.AMAZON_CREATORS_CLIENT_SECRET,scope:'creatorsapi::default'})});
  if(typeof token.access_token!=='string')throw Error('Amazon authorization failed. Use manual entry.');
  const result=await json('https://creatorsapi.amazon/catalog/v1/getItems',{hosts:['creatorsapi.amazon'],method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json','x-marketplace':host},body:JSON.stringify({itemIds:[asin],itemIdType:'ASIN',marketplace:host,partnerTag:config.AMAZON_PARTNER_TAG,resources:['images.primary.large','itemInfo.title','itemInfo.byLineInfo','itemInfo.manufactureInfo','itemInfo.productInfo','itemInfo.features']})});
  const item=result.itemsResult?.items?.find(x=>x.asin===asin);if(!item)throw Error('Amazon did not return this product. Use manual entry.');const info=item.itemInfo||{};
  product=normalizeProduct({product_name:info.title?.displayValue,brand:info.byLineInfo?.brand?.displayValue,model:info.manufactureInfo?.model?.displayValue,color:info.productInfo?.color?.displayValue,description:info.features?.displayValues?.join('\n'),product_image:item.images?.primary?.large?.url},'https://'+host+'/dp/'+asin);
  imageHosts=['m.media-amazon.com','images-na.ssl-images-amazon.com'];imageReuse=config.AMAZON_IMAGE_STORAGE_APPROVED==='true';
 }else if(actual==='Flipkart'){
  const pid=u.searchParams.get('pid');if(!pid||!/^[A-Z0-9]{8,30}$/.test(pid)||!u.pathname.includes('/p/'))throw Error('Use the full Flipkart product link with its pid product identifier.');
  if(config.FLIPKART_CATALOG_REUSE_APPROVED!=='true'||!config.FLIPKART_AFFILIATE_ID||!config.FLIPKART_AFFILIATE_TOKEN)throw Error('Flipkart extraction is not configured with approved catalog access. Keep this link and enter details manually or upload a permitted screenshot.');
  const result=await json('https://affiliate-api.flipkart.net/affiliate/product/json?id='+pid,{hosts:['affiliate-api.flipkart.net'],headers:{'Fk-Affiliate-Id':config.FLIPKART_AFFILIATE_ID,'Fk-Affiliate-Token':config.FLIPKART_AFFILIATE_TOKEN}});
  const root=result.productBaseInfoV1||result.productBaseInfo?.productAttributes||{};if((root.productId||result.productBaseInfo?.productIdentifier?.productId)!==pid)throw Error('Flipkart did not return the requested product.');
  product=normalizeProduct({product_name:root.title,brand:root.productBrand,model:root.model,color:root.color,description:root.productDescription,product_image:root.imageUrls?.['800x800']||root.imageUrls?.['400x400']},u.href);
  imageHosts=['rukminim2.flixcart.com','rukminim1.flixcart.com','img.fkcdn.com'];imageReuse=config.FLIPKART_IMAGE_STORAGE_APPROVED==='true';
 }else{
  let sites;try{sites=JSON.parse(config.PRODUCT_METADATA_SITES||'[]');}catch{throw Error('Approved product site configuration is unavailable.');}
  const site=Array.isArray(sites)?sites.find(s=>s.host===u.hostname&&s.reuseApproved===true&&Array.isArray(s.pathPrefixes)&&s.pathPrefixes.some(p=>typeof p==='string'&&p.startsWith('/')&&u.pathname.startsWith(p))):null;
  if(!site)throw Error('This website is not approved for automatic extraction. Enter details manually or upload a permitted screenshot.');
  if(u.search)throw Error('Use a public product page link without query parameters.');
  const response=await request(u.href,{hosts:[site.host]});if(!/^text\/html\b/i.test(response.type))throw Error('This page did not provide product metadata.');
  product=structuredProduct(response.bytes.toString('utf8'),u.href);imageHosts=Array.isArray(site.imageHosts)?site.imageHosts:[];imageReuse=site.imageStorageApproved===true;
 }
 if(!product.product_name)throw Error('The product name is unavailable. Enter it manually; no details were invented.');
 let image=null;const warnings=[];
 if(product.product_image&&imageReuse){try{const picture=await request(product.product_image,{hosts:imageHosts,maxBytes:5*1024*1024});const type=picture.type.split(';')[0];if(!['image/jpeg','image/png','image/webp'].includes(type))throw Error('Unsupported image');image={bytes:picture.bytes,type};}catch{warnings.push('Reference image could not be imported. You can continue without it.');}}
 else warnings.push('No reusable reference image is available. You can continue without an image.');
 product.product_image='';return {product,image,warnings,method:'structured-product-metadata'};
}
