'use client';
import {useEffect,useState} from 'react';
import {requestJson} from '../lib/request';
export default function NotificationPreferences(){
    const [enabled,setEnabled]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
    useEffect(()=>{let active=true;requestJson('preferences').then(d=>{if(active)setEnabled(d.matches);}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[]);
    return <div className="private-note"><label><input type="checkbox" checked={enabled===true} disabled={busy||enabled===null} onChange={async e=>{const next=e.target.checked;setBusy(true);try{const d=await requestJson('preferences',{matches:next});setEnabled(d.matches);setMessage('Notification preference saved.');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}}/> Notify me about new high-similarity matches</label><p>Claim and message updates remain enabled. Turning this on does not resend older match alerts.</p>{message&&<p role="status">{message}</p>}</div>;
}
