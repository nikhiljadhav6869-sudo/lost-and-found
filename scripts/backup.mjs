import './load-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { backupData, restoreBackup } from '../local/backup.mjs';
const [command,file,target]=process.argv.slice(2);
if(command==='create'&&file){
  if(fs.existsSync(file))throw new Error('Choose a new backup filename.');
  const {DB,BUCKET}=await import('../local/storage.mjs');
  const bytes=await backupData(DB,BUCKET,process.env.BACKUP_PASSWORD);
  fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});
  fs.writeFileSync(file,bytes,{flag:'wx',mode:0o600});
  console.log('Encrypted backup created. Keep it outside Git and outside the Render filesystem.');
}else if(command==='restore'&&file&&target){
  console.log(JSON.stringify(restoreBackup(fs.readFileSync(file),process.env.BACKUP_PASSWORD,target),null,2));
}else throw new Error('Usage: npm run backup -- create backups/name.lfbackup OR npm run backup -- restore backups/name.lfbackup new-directory');
