import {z} from 'zod';
export const productDetails=z.object({product_name:z.string().max(100),brand:z.string().max(60),model:z.string().max(100),color:z.string().max(50),product_image:z.string().max(150),description:z.string().max(2000),source_website:z.string().max(253),product_url:z.string().max(2000)});
export function productURL(raw:string){
 let u:URL;try{u=new URL(raw);}catch{throw Error('Enter a full HTTPS product link, or leave the optional link empty.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname.endsWith('.')||u.hostname.includes(':')||/^\d+(\.\d+){3}$/.test(u.hostname)||!u.hostname.includes('.')||/\.(local|localhost|internal|test|invalid)$/.test(u.hostname)||/[\r\n\\]/.test(raw))throw Error('Use a public HTTPS product link without account credentials, or leave it empty.');
 u.hash='';return u;
}
export function canonicalProductURL(raw:string){const u=productURL(raw);const pid=u.searchParams.get('pid');u.search='';if((u.hostname==='flipkart.com'||u.hostname==='www.flipkart.com')&&pid&&/^[A-Z0-9]{8,30}$/.test(pid))u.searchParams.set('pid',pid);return u.href;}
// The link is stored only as a reference. It is never fetched or used to infer fields.
export function manualProductReference(data:Record<string,any>){
 const link=(data.productLink??data.productData?.product_url??'').trim();
 const url=link?canonicalProductURL(link):'';
 return productDetails.parse({product_name:data.title,brand:data.brand||'',model:data.productData?.model||'',color:data.colour||'',description:data.description||'',product_image:'',source_website:url?new URL(url).hostname:'',product_url:url});
}
