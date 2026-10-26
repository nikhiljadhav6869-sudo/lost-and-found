import {randomUUID,createHash} from 'node:crypto';
const pattern=/^lfbackup-\d{4}-\d{2}-\d{2}-[a-f0-9-]{36}\.lfbackup$/;
export function createBackupStore({storageUrl,secretKey,bucket,photoBucket},fetcher=fetch){
 const url=new URL(storageUrl);
 if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.username||url.password)throw new Error('Use the HTTPS storage project origin.');
 if(!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(bucket)||bucket===photoBucket)throw new Error('Configure a separate private backup bucket.');
 const auth={apikey:secretKey};if(!secretKey.startsWith('sb_secret_'))auth.Authorization='Bearer '+secretKey;
 const base=url.origin+'/storage/v1';
 async function request(resource,options={}){
   let r;try{r=await fetcher(base+resource,{...options,headers:{...auth,...options.headers},redirect:'error',signal:AbortSignal.timeout(60000)});}catch{throw new Error('Backup storage is unavailable.');}
   if(!r.ok)throw new Error('Backup storage request failed ('+r.status+').');return r;
 }
 async function verifyPrivate(){const r=await request('/bucket/'+encodeURIComponent(bucket));if((await r.json()).public!==false)throw new Error('Backup bucket must be private.');}
 return {
  async save(bytes,time=new Date()){
   await verifyPrivate();const name='lfbackup-'+time.toISOString().slice(0,10)+'-'+randomUUID()+'.lfbackup';
   await request('/object/'+encodeURIComponent(bucket)+'/'+name,{method:'POST',headers:{'Content-Type':'application/octet-stream','x-upsert':'false','Cache-Control':'private, no-store'},body:bytes});
   // Read back the encrypted archive before any retention deletion.
   const received=new Uint8Array(await (await request('/object/'+encodeURIComponent(bucket)+'/'+name)).arrayBuffer());
   const digest=b=>createHash('sha256').update(b).digest('hex');
   if(digest(bytes)!==digest(received))throw new Error('Backup verification failed; retention was not applied.');
   return name;
  },
  async prune({days=14,time=Date.now()}={}){
   if(!Number.isInteger(days)||days<7||days>365)throw new Error('Retention must be between 7 and 365 days.');
   await verifyPrivate();const files=[];
   for(let offset=0;offset<10000;offset+=100){
    const response=await request('/object/list/'+encodeURIComponent(bucket),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefix:'',limit:100,offset,sortBy:{column:'name',order:'asc'}})});
    const rows=await response.json();if(!Array.isArray(rows))throw new Error('Invalid backup listing.');
    files.push(...rows.filter(r=>pattern.test(r.name)&&Number.isFinite(Date.parse(r.created_at))));
    if(rows.length<100)break;
    if(offset===9900)throw new Error('Backup listing exceeded the safe limit; review retention manually.');
   }
   files.sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
   const expired=files.slice(2).filter(r=>Date.parse(r.created_at)<time-days*86400000).map(r=>r.name);
   if(expired.length)await request('/object/'+encodeURIComponent(bucket),{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes:expired})});
   return expired.length;
  }
 };
}
