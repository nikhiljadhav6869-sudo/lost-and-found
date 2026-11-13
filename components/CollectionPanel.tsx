'use client';
import {t as tr} from '../lib/i18n';
import {useState} from 'react';
import {requestJson as api} from '../lib/request';
export default function CollectionPanel({claim,userId,onRefresh}:{claim:Record<string,any>;userId:string;onRefresh:()=>void}){
 const [code,setCode]=useState(''),[expires,setExpires]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function act(action:string){setBusy(true);setError('');try{const out=await api('collection/'+claim.id,{action,...(action==='collect'?{code}:{})});if(out.code){setCode(out.code);setExpires(out.expires);}else{setCode('');onRefresh();}}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(!claim.managed||claim.status!=='Approved')return null;
 return <section className="collection-panel"><h3>{tr("Collect from college staff")}</h3><p>{tr("Ownership must be approved first. Show the collection code only to authorised staff when receiving the item.")}</p>{error&&<p role="alert">{tr(error)}</p>}{claim.claimant===userId&&<><button className="button primary" disabled={busy} onClick={()=>act('issue')}>{tr("Get a collection code")}</button>{expires>Date.now()&&<p role="status"><strong className="collection-code">{code}</strong><br/>Expires at {new Date(expires).toLocaleTimeString()}. Requesting another code replaces this one.</p>}</>}{claim.staff&&claim.claimant!==userId&&<form onSubmit={e=>{e.preventDefault();act('collect');}}><label>{tr("Owner’s 8-digit code")}<input value={code} onChange={e=>setCode(e.target.value)} inputMode="numeric" pattern="[0-9]{8}" maxLength={8} required autoComplete="off"/></label><button className="button primary" disabled={busy}>{tr("Verify code and record collection")}</button></form>}</section>;
}
