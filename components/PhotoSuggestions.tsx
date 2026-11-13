'use client';
import {t as tr} from '../lib/i18n';
import {useEffect,useRef,useState} from 'react';
import {requestJson as api} from '../lib/request';
export default function PhotoSuggestions({image,onApply}:{image:string;onApply:(fields:Record<string,string>)=>void}){
 const [state,setState]=useState('idle'),[result,setResult]=useState<any>(null),[error,setError]=useState('');
 const sequence=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useEffect(()=>{sequence.current++;setState('idle');setResult(null);setError('');if(image)void analyse();return()=>{sequence.current++;if(timer.current)clearTimeout(timer.current);};},[image]);
 async function analyse(){
  const run=++sequence.current;setState('pending');setError('');
  const started=Date.now();
  try{
   const job=await api('photo-suggestions',{image});
   async function poll(){
    if(run!==sequence.current)return;
    try{
     const out=await api('photo-suggestions/'+job.id);if(run!==sequence.current)return;
     setState(out.state);
     if(out.state==='ready'){setResult(out.suggestions);onApply(out.suggestions);return;}
     if(out.state==='failed'){setError('AI could not analyse this photo. You can enter the details yourself.');return;}
     if(Date.now()-started>60000){setState('waiting');return;}
     timer.current=setTimeout(poll,2500);
    }catch{if(run===sequence.current){setState('failed');setError('AI is unavailable. Your photo is saved; continue manually.');}}
   }
   await poll();
  }catch{if(run===sequence.current){setState('failed');setError('AI is unavailable. Your photo is saved; continue manually.');}}
 }
 if(!image)return null;
 return <section className="photo-assist" aria-label={tr("AI photo suggestions")}><strong>{tr("AI photo suggestions")}</strong><p>{tr("Suggest an item name, category, colour and visible pattern. Check every suggestion before publishing. You can keep typing while AI works.")}</p><button type="button" className="button secondary" disabled={state==='pending'||state==='running'} onClick={analyse}>{state==='pending'||state==='running'?tr("Analysing photo…"):state==='waiting'?tr("Check for suggestions"):tr("Suggest details from photo")}</button>{state==='waiting'&&<p role="status">{tr("The worker is taking longer. Continue manually or check again later.")}</p>}{error&&<p role="status">{tr(error)}</p>}{result&&<div role="status"><p>{tr("AI suggestions filled only empty fields. Review and edit them below.")}</p><p>{result.title||'Item uncertain'} · {result.colour||'Colour uncertain'}</p>{result.features?.length>0&&<p>{result.features.join(' · ')}. Keep any unique ownership clue private.</p>}</div>}</section>;
}
