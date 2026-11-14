'use client';
import {t as tr} from '../lib/i18n';
import {useEffect,useId,useRef,useState} from 'react';
import {MapPin,Loader2,ArrowUpRight} from 'lucide-react';
import {approximateLocation,googleMapsUrl} from '../lib/location';

export default function LocationField({value,type,disabled,onChange,onPendingChange}:{value:string;type:string;disabled:boolean;onChange:(value:string)=>void;onPendingChange:(pending:boolean)=>void}) {
    const id=useId(),sequence=useRef(0);
    const [locating,setLocating]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
    const setPending=(pending:boolean)=>{setLocating(pending);onPendingChange(pending);};
    useEffect(()=>()=>{sequence.current++;},[]);
    function manual(value:string) {
        sequence.current++;setPending(false);setMessage('');setFailed(false);onChange(value);
    }
    function locate() {
        const request=++sequence.current;
        setFailed(false);setMessage('');
        if(!navigator.geolocation || !window.isSecureContext) {
            setFailed(true);setMessage('Location is unavailable in this browser. You can type a nearby place instead.');return;
        }
        setPending(true);
        const failure=(text:string)=>{if(request!==sequence.current)return;setPending(false);setFailed(true);setMessage(text);};
        try {
            navigator.geolocation.getCurrentPosition(position=>{
                if(request!==sequence.current)return;
                try {
                    const area=approximateLocation(position.coords.latitude,position.coords.longitude);
                    onChange(area);setPending(false);
                    setMessage(position.coords.accuracy>200 ? 'Your phone returned an estimate wider than the 200 m matching radius. Try again outdoors or type a nearby landmark.' : 'Approximate area added. Reports with map locations are matched within 200 m of this saved area. Check it on Google Maps.');
                }catch{failure('Your location could not be read. Try again or type a nearby place.');}
            },error=>failure(error.code===1?'Location access was not allowed. Enable it in your browser settings or type a place.':error.code===3?'Finding your location took too long. Try again outdoors or type a place.':'Your phone could not find its location. Check that Location is enabled, or type a place.'),{enableHighAccuracy:true,timeout:12000,maximumAge:0});
        } catch {failure('Location is unavailable right now. You can type a nearby place instead.');}
    }
    return <div className="report-location">
        <label htmlFor={id}>{type==='found'?tr("Approximate location (where you found it)"):tr("Approximate location (where you lost it)")}</label>
        <input id={id} aria-describedby={id+'-help'} required minLength={2} maxLength={100} placeholder="Nearby landmark, area or current location" value={value} disabled={disabled} onChange={e=>manual(e.target.value)}/>
        <div className="location-actions">
            <button type="button" className="button secondary" disabled={disabled||locating} onClick={locate}>{locating?<Loader2 size={16} className="spin"/>:<MapPin size={16}/>} {locating?tr("Finding location…"):tr("Use current location")}</button>
            {value.trim().length>=2 && <a href={googleMapsUrl(value)} target="_blank" rel="noopener noreferrer" className="text-button">{tr("Check on Google Maps")}<ArrowUpRight size={14}/></a>}
        </div>
        <small id={id+'-help'}>{type==='found'?'Use your current location only if you are near where you found the item.':'Use your current location only if you are near where you lost the item.'} Map-to-map matching uses a 0–200 m radius around saved approximate locations; phone accuracy can vary. This area will be public; avoid home addresses.</small>
        {message && <p className="location-message" role={failed?'alert':'status'}>{message}</p>}
    </div>;
}
