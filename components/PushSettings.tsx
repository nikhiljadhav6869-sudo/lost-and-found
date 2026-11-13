'use client';
import {t as tr} from '../lib/i18n';
import {useEffect,useState} from 'react';
import {requestJson as api} from '../lib/request';
export default function PushSettings(){
 const [config,setConfig]=useState<any>(null),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const supported=typeof window!=='undefined'&&'PushManager'in window&&'Notification'in window&&'serviceWorker'in navigator;
 useEffect(()=>{let active=true;api('push').then(c=>active&&setConfig(c)).catch(()=>{});if(supported)navigator.serviceWorker.getRegistration().then(async r=>{if(active&&r)setEnabled(!!await r.pushManager.getSubscription());});return()=>{active=false;};},[]);
 async function toggle(){setBusy(true);setMessage('');try{const registration=await navigator.serviceWorker.ready;if(enabled){const sub=await registration.pushManager.getSubscription();if(sub){await api('push',{action:'disable',endpoint:sub.endpoint});await sub.unsubscribe();}setEnabled(false);}else{if(await Notification.requestPermission()!=='granted'){setMessage('Notification permission was not granted. In-app updates still work.');return;}const raw=atob(config.publicKey.replace(/-/g,'+').replace(/_/g,'/'));const key=Uint8Array.from(raw,c=>c.charCodeAt(0));const sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});await api('push',{subscription:sub.toJSON()});setEnabled(true);}setMessage('Background notification preference saved.');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 return <div className="push-settings"><h3>{tr("Background notifications")}</h3><p>{!supported?'This browser does not support background notifications.':!config?.configured?'Background delivery is not configured yet. In-app notifications remain available.':'Receive a private reminder when the app is closed. Notification contents stay inside the app.'}</p>{supported&&config?.configured&&<button className="button secondary" disabled={busy} onClick={toggle}>{enabled?tr("Disable on this device"):tr("Enable on this device")}</button>}{message&&<p role="status">{message}</p>}</div>;
}
