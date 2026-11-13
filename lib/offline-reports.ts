import {requestJson as api,RequestError} from './request';
type Row=Record<string,any>;
const DB_NAME='lf-offline-reports-v1';
const EPOCH_PREFIX='lf-offline-epoch:';
const unavailableAccounts=new Set<string>();
// Capture before compression or another await. Sign-out changes this value first.
export function offlineAccountEpoch(userId:string){if(unavailableAccounts.has(userId))throw Error('Device storage is unavailable. Keep this form open.');try{return localStorage.getItem(EPOCH_PREFIX+userId)||'0';}catch{throw Error('Device storage is unavailable. Keep this form open.');}}
function sameEpoch(userId:string,epoch:string){try{return offlineAccountEpoch(userId)===epoch;}catch{return false;}}
async function database(){return await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{r.result.createObjectStore('reports',{keyPath:'id'});r.result.createObjectStore('photos',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Device storage is unavailable. Keep this form open.'));});}
async function store(name:string,mode:IDBTransactionMode,operation:(store:IDBObjectStore)=>IDBRequest){const db=await database();try{return await new Promise<any>((resolve,reject)=>{const tx=db.transaction(name,mode),r=operation(tx.objectStore(name));tx.oncomplete=()=>resolve(r.result);tx.onerror=tx.onabort=()=>reject(Error('Device storage could not save this report. Keep the form open.'));});}finally{db.close();}}
// Checkpoint only an existing entry: signing out must not resurrect private drafts.
async function checkpoint(row:Row){const db=await database();try{return await new Promise<boolean>((resolve,reject)=>{const tx=db.transaction('reports','readwrite'),s=tx.objectStore('reports'),r=s.get(row.id);let saved=false;r.onsuccess=()=>{if(r.result?.userId===row.userId&&r.result.lease===row.lease&&sameEpoch(row.userId,row.epoch)){s.put(row);saved=true;}};tx.oncomplete=()=>resolve(saved);tx.onerror=()=>reject(Error('Could not save upload progress.'));});}finally{db.close();}}
export async function releaseUnusedPhotos(userId:string,candidates:string[]=[]){
 const db=await database();try{await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(['reports','photos'],'readwrite'),reports=tx.objectStore('reports').getAll(),photos=tx.objectStore('photos').getAll();
  let read=0;const cleanup=()=>{if(++read!==2)return;const keep=new Set<string>();
   for(const row of reports.result as Row[])if(row.userId===userId)for(const image of row.payload.images||[])keep.add(image);
   try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i);if(!key?.startsWith('lf-report-draft-v2:'+userId+':'))continue;const draft=JSON.parse(localStorage.getItem(key)||'null');if(!draft||draft.created+7*86400000<=Date.now())continue;for(const image of draft.data?.images||[])keep.add(image);}}
   catch{return;} // Never reclaim photos when another saved draft cannot be inspected.
   const selected=new Set(candidates);for(const photo of photos.result as Row[])if(photo.userId===userId&&!keep.has(photo.id)&&(selected.has(photo.id)||photo.created<Date.now()-7*86400000))tx.objectStore('photos').delete(photo.id);
  };reports.onsuccess=cleanup;photos.onsuccess=cleanup;tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(Error('Could not update device photo storage.'));
 });}finally{db.close();}
}
export async function cleanOfflineStorage(userId:string){
 const week=7*86400000,rows=await queuedReports(userId);
 for(const row of rows)if(row.state==='submitted'&&row.created<Date.now()-week)await store('reports','readwrite',s=>s.delete(row.id));
 await releaseUnusedPhotos(userId);
}
export async function saveLocalPhoto(userId:string,blob:Blob,epoch=offlineAccountEpoch(userId)){await cleanOfflineStorage(userId);const photos=(await store('photos','readonly',s=>s.getAll()) as Row[]).filter(p=>p.userId===userId);if(photos.reduce((n,p)=>n+(p.size??p.blob?.size??0),0)+blob.size>50*1024*1024)throw Error('Device photo storage is full. Publish or discard saved reports before adding more photos.');const bytes=await blob.arrayBuffer(),id='local-photo:'+crypto.randomUUID();await store('photos','readwrite',s=>{if(!sameEpoch(userId,epoch))throw Error('This account changed. Open the report again before adding photos.');return s.put({id,userId,bytes,mime:blob.type,size:blob.size,created:Date.now()});});return id;}
export async function localPhoto(ref:string,userId:string){const photo=await store('photos','readonly',s=>s.get(ref));if(photo?.userId!==userId)throw Error('This device photo is unavailable. Choose it again.');return photo.bytes?new Blob([photo.bytes],{type:photo.mime}):photo.blob as Blob;}
export async function uploadLocalPhoto(ref:string,userId:string){
 const blob=await localPhoto(ref,userId),form=new FormData();form.append('file',blob,'photo.webp');
 const r=await fetch('/api/upload',{method:'POST',headers:{'X-Expected-User':userId},body:form,signal:AbortSignal.timeout(30000)});
 let out:any;try{out=await r.json();}catch{throw new RequestError('Photo upload could not be confirmed.','',r.status>=500?r.status:0);}
 if(!r.ok)throw new RequestError(out.error||'Photo upload failed.','',r.status);return out.url as string;
}
export async function queuedReports(userId:string){return (await store('reports','readonly',s=>s.getAll()) as Row[]).filter(r=>r.userId===userId).sort((a,b)=>b.created-a.created);}
export async function enqueueReport(userId:string,payload:Row){
 const epoch=offlineAccountEpoch(userId);
 if(payload.id)throw Error('Edits need a connection. Your changes remain saved on this device.');
 const pending=(await queuedReports(userId)).filter(r=>r.state!=='submitted');if(pending.length>=10)throw Error('Finish or remove a queued report before adding another.');
 const id=payload.submissionId||crypto.randomUUID(),entry={id,userId,epoch,localPhotos:(payload.images||[]).filter((ref:string)=>ref.startsWith('local-photo:')),payload:{...payload,submissionId:id},created:Date.now(),state:'waiting',attempts:0,next:0,leaseUntil:0,error:''};
 const existing=await store('reports','readonly',s=>s.get(id));if(existing){if(existing.userId!==userId)throw Error('This draft belongs to another account.');return existing;}
 const db=await database();let result:Row=entry;try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('reports','readwrite'),s=tx.objectStore('reports'),r=s.get(id);let reason='';r.onsuccess=()=>{if(!sameEpoch(userId,epoch)){reason='This account changed. Open the report again.';tx.abort();return;}if(r.result){if(r.result.userId!==userId){reason='This draft belongs to another account.';tx.abort();return;}result=r.result;}else s.put(entry);};tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(Error(reason||'Could not save the report queue.'));});}finally{db.close();}window.dispatchEvent(new Event('lf-queue'));return result;
}
async function claim(id:string,userId:string){const epoch=offlineAccountEpoch(userId),db=await database();try{return await new Promise<Row|null>((resolve,reject)=>{const tx=db.transaction('reports','readwrite'),s=tx.objectStore('reports'),r=s.get(id);let row:Row|null=null;r.onsuccess=()=>{const found=r.result;if(sameEpoch(userId,epoch)&&found?.userId===userId&&(!found.epoch||found.epoch===epoch)&&found.state!=='submitted'&&found.leaseUntil<Date.now()&&found.next<=Date.now()){row={...found,epoch,lease:crypto.randomUUID(),leaseUntil:Date.now()+180000,state:'uploading'};s.put(row);}};tx.oncomplete=()=>resolve(row);tx.onerror=()=>reject(Error('Could not read the offline queue.'));});}finally{db.close();}}
export async function sendQueuedReport(id:string,userId:string){
 if(!navigator.onLine)return null;const row=await claim(id,userId);if(!row)return null;
 try{
  const session=await api('me');if(session.user?.id!==userId)throw new RequestError('Sign in to the account that saved this report.','',401);
  for(let i=0;i<row.payload.images.length;i++)if(row.payload.images[i].startsWith('local-photo:')){row.payload.images[i]=await uploadLocalPhoto(row.payload.images[i],userId);row.leaseUntil=Date.now()+180000;if(!await checkpoint(row))return null;}
  if(!await checkpoint(row))return null;
  const result=await api('reports',row.payload,'POST',userId);row.state='submitted';row.reportId=result.id;row.error='';row.leaseUntil=0;if(!await checkpoint(row))return null;await releaseUnusedPhotos(userId,row.localPhotos||[]).catch(()=>{});return result;
 }catch(e){const error=e as RequestError;row.attempts++;row.state=error.status>=400&&error.status<500&&error.status!==429?'needs-attention':'waiting';row.error=error.message;row.next=Date.now()+Math.min(300000,5000*2**Math.min(row.attempts,6));row.leaseUntil=0;await checkpoint(row);return null;}
 finally{window.dispatchEvent(new Event('lf-queue'));}
}
async function changeQueued(id:string,userId:string,remove:boolean){const epoch=offlineAccountEpoch(userId),db=await database();try{return await new Promise<Row|null>((resolve,reject)=>{const tx=db.transaction('reports','readwrite'),s=tx.objectStore('reports'),r=s.get(id);let row:Row|null=null,reason='';r.onsuccess=()=>{const found=r.result;if(found?.userId!==userId||!sameEpoch(userId,epoch))return;if(found.leaseUntil>Date.now()){reason='Wait for the current upload to finish before changing it.';tx.abort();return;}row=found;if(remove)s.delete(id);else s.put({...found,epoch,next:0,state:'waiting'});};tx.oncomplete=()=>resolve(row);tx.onerror=tx.onabort=()=>reject(Error(reason||'Could not update the saved report.'));});}finally{db.close();}}
export async function retryQueued(id:string,userId:string){if(await changeQueued(id,userId,false))return sendQueuedReport(id,userId);}
export async function removeQueued(id:string,userId:string){const row=await changeQueued(id,userId,true);if(row)await releaseUnusedPhotos(userId,[...(row.localPhotos||[]),...(row.payload.images||[])]);window.dispatchEvent(new Event('lf-queue'));}
export async function clearOfflineAccount(userId:string){try{localStorage.setItem(EPOCH_PREFIX+userId,crypto.randomUUID());}catch{unavailableAccounts.add(userId);}const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['reports','photos'],'readwrite');for(const name of ['reports','photos']){const s=tx.objectStore(name),r=s.openCursor();r.onsuccess=()=>{const cursor=r.result;if(!cursor)return;if(cursor.value.userId===userId)cursor.delete();cursor.continue();};}tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(Error('Could not remove this account’s local reports.'));});}finally{db.close();}}
