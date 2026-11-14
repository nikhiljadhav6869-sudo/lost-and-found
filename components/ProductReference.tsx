'use client';
type Row=Record<string,any>;
export default function ProductReference({data,change,disabled}:{data:Row;change:(key:string,value:any)=>void;disabled:boolean}){
 return <section className="product-reference" aria-label="Report without an actual photo">
  <button type="button" className="button secondary" aria-pressed={!!data.noPhoto} onClick={()=>change('noPhoto',!data.noPhoto)} disabled={disabled}>{data.noPhoto?'Use my actual photo':"I Don't Have a Photo"}</button>
  {data.noPhoto&&<div className="product-reference-fields">
   <p>Take a screenshot of the same or a similar item in your shopping app. Add it below as a reference, then fill in your lost item's details yourself.</p>
   <label>Product link (optional)<input type="url" inputMode="url" maxLength={2000} value={data.productLink??data.productData?.product_url??''} disabled={disabled} onChange={e=>change('productLink',e.target.value)} placeholder="Paste an Amazon, Flipkart or other product link"/></label>
   <small>For reference only. We do not read the link or use AI to fill these details.</small>
   <label>Product model (optional)<input maxLength={100} disabled={disabled} value={data.productData?.model||''} placeholder="Enter the model if you know it" onChange={e=>change('productData',{product_name:'',brand:'',color:'',product_image:'',description:'',source_website:'',product_url:'',...data.productData,model:e.target.value})}/></label>
   <p>Enter the item name, brand, colour and description below. A link and screenshot are optional.</p>
   <p className="private-note">Your screenshot will be labelled Reference Product Image. Crop out names, addresses, order numbers and payment information before uploading. Use an image you are allowed to share.</p>
  </div>}
 </section>;
}
