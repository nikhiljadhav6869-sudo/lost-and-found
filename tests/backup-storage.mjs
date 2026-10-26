import assert from 'node:assert/strict';
import {createBackupStore} from '../local/backup-storage.mjs';
const options={storageUrl:'https://storage.example.test',secretKey:'sb_secret_test',bucket:'private-backups',photoBucket:'photos'};
const time=Date.parse('2026-10-26T00:00:00Z');
const name=(day,n)=>'lfbackup-2026-10-'+day+'-'+n.toString().padStart(8,'0')+'-0000-0000-0000-000000000000.lfbackup';
const records=[{name:name('25',1),created_at:'2026-10-25'},{name:name('24',2),created_at:'2026-10-24'},{name:name('01',3),created_at:'2026-10-01'},{name:'unrelated-private-file',created_at:'2020-01-01'}];
let saved,removed=[],publicBucket=false,corrupt=false;
const fetcher=async(url,init)=>{
 assert.equal(init.headers.apikey,'sb_secret_test');assert.equal(init.redirect,'error');
 if(url.includes('/bucket/'))return Response.json({public:publicBucket});
 if(url.includes('/object/list/'))return Response.json(records);
 if(init.method==='DELETE'){removed=JSON.parse(init.body).prefixes;return Response.json({});}
 if(init.method==='POST'){saved=init.body;assert.equal(init.headers['x-upsert'],'false');return Response.json({});}
 return new Response(corrupt?new Uint8Array([99]):saved);
};
const store=createBackupStore(options,fetcher);
await store.save(new Uint8Array([1,2,3]));
assert.equal(await store.prune({time,days:14}),1);assert.deepEqual(removed,[name('01',3)]);
publicBucket=true;await assert.rejects(()=>store.save(new Uint8Array([1])),/private/);
publicBucket=false;corrupt=true;await assert.rejects(()=>store.save(new Uint8Array([1])),/verification failed/);
await assert.rejects(()=>store.prune({days:1}),/Retention/);
assert.throws(()=>createBackupStore({...options,bucket:'photos'}),/separate/);
assert.throws(()=>createBackupStore({...options,storageUrl:'http://storage.example.test'}),/HTTPS/);
console.log('PASS private encrypted archive storage, read-back integrity, bounded retention and unrelated-file preservation');

// A database-only snapshot must obey the same bound as photo archives.
const {backupData}=await import('../local/backup.mjs');
const hugeDatabase={
 prepare(query){return query;},
 async batch(queries){return queries.map(query=>({results:query.includes('"reports"')?[{description:'x'.repeat(64*1024*1024)}]:[]}));}
};
let storageReads=0;
await assert.rejects(()=>backupData(hugeDatabase,{get:async()=>{storageReads++;throw new Error('Unexpected photo read');}},'test-only-backup-password-over-20-characters'),/larger than 64 MB/);
assert.equal(storageReads,0);
console.log('PASS oversized database-only backup rejected before storage reads or encryption');
