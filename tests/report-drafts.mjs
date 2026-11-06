import assert from 'node:assert/strict';
import {reportDraftKey,readReportDraft,activeReportDraft,saveReportDraft,closeReportDraft,removeReportDraft,clearAccountDrafts} from '../lib/report-drafts.ts';
const localDescriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage'),sessionDescriptor=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
function storage(){return Object.create({getItem(key){return this[key]??null;},setItem(key,value){this[key]=String(value);},removeItem(key){delete this[key];}});}
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage()});
Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:storage()});
try {
 const data={type:'found',title:'Blue bag',category:'Bags',description:'',colour:'Blue',brand:'',date:'2026-11-06',location:'Library',privateDetails:'Private stitching',images:['/api/media/abc-123.webp'],password:'NEVER-SAVE-THIS'};
 const key=reportDraftKey('alice',data);
 assert.equal(saveReportDraft('alice',key,data),true);
 assert.equal(activeReportDraft('alice').privateDetails,data.privateDetails);
 assert.deepEqual(activeReportDraft('alice').images,data.images);
 assert.ok(!localStorage.getItem(key).includes(data.password));
 assert.equal(activeReportDraft('bob'),null);
 assert.equal(saveReportDraft('bob',key,data),false);
 localStorage.setItem('lf-report-active-v2:bob',key);assert.equal(activeReportDraft('bob'),null);
 closeReportDraft('alice',key);assert.equal(activeReportDraft('alice'),null);assert.ok(readReportDraft(key));
 assert.equal(saveReportDraft('alice',key,{...data,images:['https://untrusted.example/private.jpg']}),false);
 const expired=JSON.parse(localStorage.getItem(key));expired.created=Date.now()-8*86400000;localStorage.setItem(key,JSON.stringify(expired));
 assert.equal(readReportDraft(key),null);assert.equal(localStorage.getItem(key),null);
 localStorage.setItem(key,'malformed');assert.equal(readReportDraft(key),null);
 assert.equal(saveReportDraft('alice',key,data),true);
 const otherKey=reportDraftKey('bob',data);saveReportDraft('bob',otherKey,data);
 clearAccountDrafts('alice');assert.equal(readReportDraft(key),null);assert.ok(readReportDraft(otherKey));
 removeReportDraft('bob',otherKey);assert.equal(activeReportDraft('bob'),null);assert.equal(readReportDraft(otherKey),null);
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('Storage disabled');}});
 assert.equal(saveReportDraft('alice',key,data),false);assert.equal(activeReportDraft('alice'),null);
 console.log('PASS draft field allowlist, photo paths, expiry, account isolation, explicit deletion and unavailable-storage handling');
}finally{
 if(localDescriptor)Object.defineProperty(globalThis,'localStorage',localDescriptor);else delete globalThis.localStorage;
 if(sessionDescriptor)Object.defineProperty(globalThis,'sessionStorage',sessionDescriptor);else delete globalThis.sessionStorage;
}
