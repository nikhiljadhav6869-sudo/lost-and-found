'use client';
import {useEffect} from 'react';
import {restoreLanguage,setLanguage,useLanguage,type Language} from '../lib/i18n';
export default function LanguageSelector(){const language=useLanguage();useEffect(restoreLanguage,[]);return <label className="language-selector"><span className="sr-only">Language / भाषा</span><select aria-label="Language / भाषा" value={language} onChange={e=>setLanguage(e.target.value as Language)}><option value="en">English</option><option value="hi">हिन्दी</option><option value="mr">मराठी</option></select></label>;}
