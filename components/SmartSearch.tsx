'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { requestJson } from '../lib/request';
export default function SmartSearch({ onOpen, signedIn }: { onOpen: (id: string) => void; signedIn: boolean }) {
    const [query,setQuery]=useState(''), [image,setImage]=useState(''), [job,setJob]=useState('');
    const [state,setState]=useState(''), [error,setError]=useState(''), [items,setItems]=useState<Record<string,any>[]>([]);
    const [busy,setBusy]=useState(false), [available,setAvailable]=useState<boolean|null>(null);
    const check = () => requestJson('config').then(d=>setAvailable(d.intelligence)).catch(e=>setError(e.message));
    useEffect(()=>{ check(); },[]);
    useEffect(()=>{
        if (!job) return;
        let active=true, timer: ReturnType<typeof setTimeout>;
        const started=Date.now();
        const poll=async()=>{
            if (Date.now()-started>120000) { if(active){setError('Processing is taking longer than expected. Use Check result to try again.');setBusy(false);}return; }
            try {
                if (!document.hidden && navigator.onLine) {
                    const d=await requestJson('smart-search/'+job);
                    if (!active) return;
                    setState(d.state); setItems(d.items || []);
                    if (d.state==='ready' || d.state==='expired' || (d.state==='failed'&&!d.retryable)) { setError(d.message||'');setBusy(false);return; }
                }
            } catch(e) { if(active){setError((e as Error).message);setBusy(false);} return; }
            if(active)timer=setTimeout(poll,3000);
        };
        poll();return()=>{active=false;clearTimeout(timer);};
    },[job]);
    async function submit(e:FormEvent) {
        e.preventDefault();setBusy(true);setError('');setItems([]);setState('');
        try {const d=await requestJson('smart-search',{query,image:image||undefined});setJob(d.id);setState(d.state);}
        catch(e){setError((e as Error).message);setBusy(false);}
    }
    return <section className="muted-box" aria-label="Smart search"><h3>Search by description or photo</h3>
        <p>Compare meaning and visual appearance. Suggestions do not establish ownership. Search input expires after 24 hours; unattached photos are cleaned after seven days.</p>
        {available===false&&<p role="status">AI processing is offline. Regular search and filters still work. <button onClick={check}>Check availability</button></p>}
        {!signedIn ? <p>Sign in to use photo and semantic search. Public browsing is available above.</p> : <form onSubmit={submit}>
            <label>Describe the item<input maxLength={500} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Black wireless earbuds in a small charging case"/></label>
            <label>Photo (optional)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async e=>{
                const file=e.target.files?.[0];e.target.value='';if(!file)return;
                if(file.size>5*1024*1024){setError('Choose a photo under 5 MB.');return;}
                setBusy(true);setError('');try {
                    const form=new FormData();form.append('file',file);
                    const response=await fetch('/api/upload',{method:'POST',body:form,signal:AbortSignal.timeout(30000)});
                    const d=await response.json() as Record<string,any>;if(!response.ok)throw new Error(d.error||'Upload failed.');setImage(d.url);
                } catch {setError('The photo upload could not be confirmed. Please try again.');} finally{setBusy(false);}
            }}/></label>
            {image&&<p>Photo ready. <button type="button" onClick={()=>setImage('')}>Remove photo</button></p>}
            <button className="button secondary" disabled={busy||available!==true||(!query.trim()&&!image)}>Find similar reports</button>
        </form>}
        {busy&&<p role="status">Processing your search… You can continue browsing.</p>}
        {error&&<p role="alert">{error}</p>}
        {job&&!busy&&['pending','running'].includes(state)&&<button onClick={async()=>{try{const d=await requestJson('smart-search/'+job);setState(d.state);setItems(d.items||[]);setError(d.message||(d.state==='ready'?'':'Still processing. Please check again shortly.'));}catch(e){setError((e as Error).message);}}}>Check result</button>}
        {state==='ready'&&!items.length&&<p>No close suggestions among the latest processed active reports.</p>}
        {items.map(m=><article key={m.report.id}><button className="text-button" onClick={()=>onOpen(m.report.id)}>{m.report.title} — {m.label}</button><p>{m.reasons.join(' · ')}</p></article>)}
    </section>;
}
