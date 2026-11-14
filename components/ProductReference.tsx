'use client';
import {useRef,useState,useEffect} from 'react';
import {requestJson as api} from '../lib/request';
import {Loader2} from 'lucide-react';
type Row=Record<string,any>;
export default function ProductReference({data,change,apply,disabled}:{data:Row;change:(key:string,value:any)=>void;apply:(product:Row)=>void;disabled:boolean}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const current=useRef(data);current.current=data;const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 return <section className="product-reference" aria-label="Report without an actual photo">
  <button type="button" className="button secondary" aria-pressed={!!data.noPhoto} onClick={()=>change('noPhoto',!data.noPhoto)} disabled={disabled||busy}>{data.noPhoto?'Use my actual photo':"I Don't Have a Photo"}</button>
  {data.noPhoto&&<div className="product-reference-fields">
   <p>Use a shopping product link, or enter what you remember. A catalog picture is a reference, not proof of ownership.</p>
   <label>Shopping website<select value={data.productWebsite||'Amazon'} disabled={busy||disabled} onChange={e=>change('productWebsite',e.target.value)}><option>Amazon</option><option>Flipkart</option><option>Other Website</option></select></label>
   <label>Product link (optional)<input type="text" inputMode="url" maxLength={2000} value={data.productLink||''} disabled={busy||disabled} onChange={e=>change('productLink',e.target.value)} placeholder="https://www.amazon.in/dp/…"/></label>
   <button type="button" className="button secondary" disabled={busy||disabled||!data.productLink?.trim()} onClick={async()=>{
    const url=data.productLink,website=data.productWebsite||'Amazon';setBusy(true);setError('');setMessage('');
    try{const result=await api('product-extract',{url,website});if(!alive.current||current.current.productLink!==url)return;apply(result.product);setMessage(['Available product details were extracted from catalog metadata. Review every field before publishing.',...result.warnings].join(' '));}
    catch(e){if(alive.current)setError(e instanceof Error?e.message:'Extraction failed. You can enter details manually.');}
    finally{if(alive.current)setBusy(false);}
   }}>{busy&&<Loader2 size={16} className="spin"/>}Extract Product Details Using AI</button>
   <small>Uses authorised catalog data and structured extraction. Missing details are left blank; nothing is guessed. Amazon and Flipkart require the operator’s approved catalog integration.</small>
   <button type="button" className="text-button" onClick={()=>{setError('');setMessage('Enter the item details below. You can publish without a link or a photo.');}} disabled={disabled}>I Don't Have a Product Link</button>
   {error&&<p role="alert" className="alert error">{error} Your link is kept. Retry, fill the fields below, or choose a product screenshot.</p>}
   {message&&<p role="status" className="alert">{message}</p>}
   <label>Product model (optional)<input maxLength={100} value={data.productData?.model||''} placeholder="Not available — enter if known" onChange={e=>change('productData',{product_name:'',brand:'',color:'',product_image:'',description:'',source_website:'',product_url:'',...data.productData,model:e.target.value})}/></label>
   <p className="private-note">Upload only screenshots or reference images you are allowed to share. Crop out order numbers, names, addresses and payment information.</p>
  </div>}
 </section>;
}
