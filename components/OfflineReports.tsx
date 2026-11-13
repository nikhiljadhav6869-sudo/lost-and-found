'use client';
import {t as tr} from '../lib/i18n';
import {useEffect,useState} from 'react';
import {queuedReports,sendQueuedReport,retryQueued,removeQueued,localPhoto} from '../lib/offline-reports';
export function DraftPhoto({src,userId,alt}:{src:string;userId:string;alt:string}){
 const [url,setUrl]=useState(src.startsWith('local-photo:')?'':src);
 useEffect(()=>{let active=true,href='';if(src.startsWith('local-photo:'))localPhoto(src,userId).then(blob=>{if(active){href=URL.createObjectURL(blob);setUrl(href);}}).catch(()=>{});else setUrl(src);return()=>{active=false;if(href)URL.revokeObjectURL(href);};},[src,userId]);
 return url?<img src={url} alt={alt}/>:<span>{alt} · saved on this device</span>;
}
export default function OfflineReports({userId,onOpen}:{userId:string;onOpen:(id:string)=>void}){
 const [items,setItems]=useState<Record<string,any>[]>([]),[error,setError]=useState('');
 useEffect(()=>{let active=true,running=false;async function refresh(){try{const rows=await queuedReports(userId);if(active)setItems(rows);}catch(e){if(active)setError((e as Error).message);}}
 async function flush(){if(running||!navigator.onLine)return;running=true;try{for(const row of await queuedReports(userId)){if(!active)break;if(row.state==='waiting'||row.state==='uploading')await sendQueuedReport(row.id,userId);}}catch(e){if(active)setError((e as Error).message);}finally{running=false;await refresh();}}
 refresh();flush();const timer=setInterval(flush,30000);window.addEventListener('online',flush);window.addEventListener('lf-queue',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('online',flush);window.removeEventListener('lf-queue',refresh);};},[userId]);
 if(!items.length&&!error)return null;
 return <section className="offline-reports" aria-label="Report submission queue"><h3>{tr("Saved submissions")}</h3>{error&&<p role="alert">{tr(error)}</p>}{items.map(row=><article key={row.id}><strong>{row.payload.title}</strong><p role="status">{row.state==='submitted'?tr("Successfully submitted"):row.state==='uploading'?tr("Uploading…"):row.state==='needs-attention'?tr("Needs your attention"):tr("Saved locally · waiting to upload")}</p>{row.error&&<p>{tr(row.error)}</p>}{row.state==='submitted'?<button className="button secondary" onClick={()=>onOpen(row.reportId)}>{tr("Open report")}</button>:<button className="button secondary" disabled={row.leaseUntil>Date.now()} onClick={()=>retryQueued(row.id,userId).catch(e=>setError(e.message))}>{tr("Retry upload")}</button>}<button className="text-button" disabled={row.leaseUntil>Date.now()} onClick={()=>removeQueued(row.id,userId).catch(e=>setError(e.message))}>{row.state==='submitted'?tr("Clear receipt"):tr("Discard queued report")}</button></article>)}<p>{tr("Uploads retry while this app is open and you are signed in. Signing out removes local submissions and photos.")}</p></section>;
}
