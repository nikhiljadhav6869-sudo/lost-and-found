'use client';
import {useEffect,useState} from 'react';
import {requestJson} from '../lib/request';
import PushSettings from './PushSettings';
import {t as tr} from '../lib/i18n';
export default function NotificationPreferences(){
 const [prefs,setPrefs]=useState<Record<string,boolean>|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{let active=true;requestJson('preferences').then(d=>{if(active)setPrefs(d);}).catch(e=>{if(active)setMessage(e.message);});return()=>{active=false;};},[]);
 async function change(key:string,value:boolean){if(!prefs)return;setBusy(true);try{const next={...prefs,[key]:value};await requestJson('preferences',next);setPrefs(next);setMessage(tr('Notification preference saved.'));}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 return <div className="notification-settings">{[['matches','Notify me about new high-similarity matches'],['pushMatches','Background reminders for matches'],['pushClaims','Background reminders for claims and returns']].map(([key,label])=><label key={key}><input type="checkbox" checked={prefs?.[key]===true} disabled={busy||!prefs} onChange={e=>change(key,e.target.checked)}/>{tr(label)}</label>)}<p>Claim and message updates remain in your dashboard. Enabling a preference does not resend old alerts.</p><PushSettings/>{message&&<p role="status">{message}</p>}</div>;
}
