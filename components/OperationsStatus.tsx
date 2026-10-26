'use client';
import { useEffect, useState } from 'react';
import { requestJson } from '../lib/request';
type Row = Record<string,any>;
export default function OperationsStatus() {
    const [status,setStatus]=useState<Row|null>(null),[error,setError]=useState('');
    const [users,setUsers]=useState<Row[]|null>(null),[page,setPage]=useState(0),[busy,setBusy]=useState(false);
    const load=()=>{setError('');return requestJson('admin/operations').then(setStatus).catch(e=>setError(e.message));};
    useEffect(()=>{load();},[]);
    async function loadUsers(next:number){setBusy(true);try{const d=await requestJson('admin/users?page='+next);setUsers(d.items);setPage(next);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
    return <aside className="operations-status" aria-label="Service status"><h2>Service status</h2>
        <button className="text-button" onClick={load}>Refresh status</button>{error&&<p role="alert">{error}</p>}
        {status ? <>
            <p><strong>Storage:</strong> {status.storage==='remote'?'External database and private photo storage':'Local storage — requires a persistent disk'}</p>
            <p><strong>Account email:</strong> {status.auth.emailVerification?'Configured; provider acceptance is not proof of inbox delivery':'Not configured'}</p>
            <p><strong>AI worker:</strong> {status.intelligence?'Recent heartbeat received':'Offline or not configured; public-detail matching remains available'}</p>
            <p><strong>Cleanup:</strong> {status.cleanup.candidates} old unattached photos, {status.cleanup.queued} retries, {status.cleanup.expiredLimits} expired rate-limit records.</p>
            <p><strong>Accounts:</strong> {status.users.count}. <button className="text-button" disabled={busy} onClick={()=>loadUsers(0)}>View accounts</button></p>
            {users&&<div><ul>{users.map(u=><li key={u.id}>{u.name} — {u.emailVerified?'Verified':'Unverified'} · {new Date(u.createdAt).toLocaleDateString()}</li>)}</ul><button disabled={busy||page===0} onClick={()=>loadUsers(page-1)}>Previous accounts</button><button disabled={busy||users.length<25} onClick={()=>loadUsers(page+1)}>Next accounts</button></div>}
            <h3>Processing queue</h3>{status.jobs.length?<ul>{status.jobs.map((j:Row)=><li key={j.state}>{j.state}: {j.count}</li>)}</ul>:<p>No queued reports.</p>}
            <h3>Operations in the last 24 hours</h3>
            {status.events.some((e:Row)=>e.status==='failed'&&e.count>=3)&&<p role="alert">Repeated failures require attention. Review the affected service before inviting more users.</p>}
            {status.events.length?<ul>{status.events.map((e:Row)=><li key={e.kind+e.status}>{e.kind} — {e.status}: {e.count}{e.averageMs!==null?' · average '+e.averageMs+' ms':''}</li>)}</ul>:<p>No recorded events. This does not establish uptime.</p>}
            <h3>Real report categories</h3><ul>{status.activity.map((a:Row)=><li key={a.category}>{a.category}: {a.count}</li>)}</ul>
            <p>Average resolution time: {status.resolution.averageDays===null?'No timed returns yet':status.resolution.averageDays+' days'} ({status.resolution.measuredReturns} returns with recorded completion times). Older returns without timestamps are excluded.</p>
            <small>Cleanup and encrypted backups require the operator schedule. Logs exclude message bodies, email addresses and credentials. API timing records cover slow requests and failures, not every request.</small>
        </> : <p role="status">Loading service status…</p>}
    </aside>;
}
