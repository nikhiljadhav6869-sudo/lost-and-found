import './load-env.mjs';
import path from 'node:path';
import {build} from 'esbuild';
import {backupData} from '../local/backup.mjs';
import {createBackupStore} from '../local/backup-storage.mjs';
import {DB,BUCKET,storageConfig} from '../local/storage.mjs';
if(storageConfig.mode!=='remote')throw new Error('Scheduled operations require the remote storage configuration.');
if(!process.env.BACKUP_BUCKET||!process.env.BACKUP_PASSWORD)throw new Error('Set private backup storage and encryption credentials before enabling this schedule.');
await build({entryPoints:['lib/maintenance.ts'],outfile:'.sites-runtime/operations-maintenance.mjs',bundle:true,platform:'node',format:'esm'});
const {maintain}=await import('../.sites-runtime/operations-maintenance.mjs');
const store=createBackupStore({...storageConfig,bucket:process.env.BACKUP_BUCKET,photoBucket:storageConfig.bucket});
const log=async(kind,status,started)=>DB.prepare('INSERT INTO operations(id,kind,status,duration,created) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),kind,status,Date.now()-started,Date.now()).run();
let started=Date.now();
try{
 const bytes=await backupData(DB,BUCKET,process.env.BACKUP_PASSWORD);
 await store.save(bytes);
 const removed=await store.prune({days:Number(process.env.BACKUP_RETENTION_DAYS||14)});
 await log('backup','ok',started);console.log(JSON.stringify({event:'encrypted_backup_verified',bytes:bytes.length,expiredArchivesRemoved:removed}));
}catch{await log('backup','failed',started).catch(()=>{});throw new Error('Backup failed; cleanup was not run. Review configuration and private storage capacity.');}
started=Date.now();
try{const result=await maintain(DB,BUCKET,{apply:true});if(result.failedUploads)throw new Error('Cleanup retry required');await log('maintenance','ok',started);console.log(JSON.stringify({event:'maintenance_completed',...result}));}
catch{await log('maintenance','failed',started).catch(()=>{});throw new Error('Maintenance failed; retry queue retained.');}
