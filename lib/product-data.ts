import {z} from 'zod';
export const productInput=z.object({website:z.enum(['Amazon','Flipkart','Other Website']),url:z.string().trim().max(2000)});
export const productDetails=z.object({product_name:z.string().max(100),brand:z.string().max(60),model:z.string().max(100),color:z.string().max(50),product_image:z.string().max(150),description:z.string().max(2000),source_website:z.string().max(253),product_url:z.string().max(2000)});
export function productURL(raw:string){
 let u:URL;try{u=new URL(raw);}catch{throw Error('Enter a full HTTPS product link.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname.endsWith('.')||u.hostname.includes(':')||/^\d+(\.\d+){3}$/.test(u.hostname)||!u.hostname.includes('.')||/\.(local|localhost|internal|test|invalid)$/.test(u.hostname)||/[\r\n\\]/.test(raw))throw Error('Use a public HTTPS product page, without account credentials or a custom port.');
 u.hash='';return u;
}
export function canonicalProductURL(raw:string){const u=productURL(raw);const pid=u.searchParams.get('pid');u.search='';if((u.hostname==='flipkart.com'||u.hostname==='www.flipkart.com')&&pid&&/^[A-Z0-9]{8,30}$/.test(pid))u.searchParams.set('pid',pid);return u.href;}
export function plainProductText(value:unknown,max:number){return typeof value==='string'?value.replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';}
export function normalizeProduct(p:Record<string,unknown>,url:string){return {product_name:plainProductText(p.product_name,100),brand:plainProductText(p.brand,60),model:plainProductText(p.model,100),color:plainProductText(p.color,50),product_image:typeof p.product_image==='string'?p.product_image:'',description:plainProductText(p.description,2000),source_website:productURL(url).hostname,product_url:canonicalProductURL(url)};}
export function structuredProduct(html:string,url:string){
 const products:Record<string,any>[]=[];let visited=0;
 const walk=(node:any,depth=0)=>{if(depth>12||++visited>3000||!node||typeof node!=='object')return;if(Array.isArray(node)){node.slice(0,100).forEach(x=>walk(x,depth+1));return;}const types=Array.isArray(node['@type'])?node['@type']:[node['@type']];if(types.includes('Product'))products.push(node);for(const k of ['@graph','mainEntity'])if(node[k])walk(node[k],depth+1);};
 for(const match of html.matchAll(/<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)){try{walk(JSON.parse(match[1]));}catch{}if(products.length>20)break;}
 const canonical=canonicalProductURL(url),matches=products.filter(p=>{try{return canonicalProductURL(p.url||p['@id'])===canonical;}catch{return false;}});
 const p=matches.length===1?matches[0]:products.length===1?products[0]:null;
 if(!p)throw Error('No unambiguous product metadata was available. Enter details manually or upload a screenshot.');
 const img=Array.isArray(p.image)?p.image[0]:p.image;const specs=Array.isArray(p.additionalProperty)?p.additionalProperty.slice(0,8).map((x:any)=>[plainProductText(x.name,60),plainProductText(x.value,100)].filter(Boolean).join(': ')).filter(Boolean).join('; '):'';
 return normalizeProduct({product_name:p.name,brand:typeof p.brand==='string'?p.brand:p.brand?.name,model:typeof p.model==='string'?p.model:p.model?.name,color:p.color,product_image:typeof img==='string'?new URL(img,url).href:img?.url?new URL(img.url,url).href:'',description:[plainProductText(p.description,1600),specs].filter(Boolean).join('\n')},url);
}
