import { randomBytes, scryptSync, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { checkedStorageKey } from './supabase-bucket.mjs';
const tables = ['user','session','account','verification','reports','claims','messages','saved','notifications','blocks','flags','limits','uploads','match_alerts','upload_cleanup','embedding_jobs','embeddings','preferences','match_feedback','operations','search_jobs','local_migrations'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const migrations = () => fs.readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort().map(name => ({name,sql:fs.readFileSync(path.join('drizzle',name),'utf8')}));
function key(password, salt) { if (typeof password !== 'string' || password.length < 20) throw new Error('Set BACKUP_PASSWORD to at least 20 characters; keep it separate from backups.'); return scryptSync(password,salt,32); }
export async function backupData(db, bucket, password) {
  const salt=randomBytes(16), iv=randomBytes(12), secret=key(password,salt);
  const snapshot=await db.batch(tables.map(table=>db.prepare(`SELECT * FROM "${table}"`)));
  const data=Object.fromEntries(tables.map((table,index)=>[table,snapshot[index].results]));
  const images={}; let size=Buffer.byteLength(JSON.stringify(data));
  if(size>64*1024*1024)throw new Error('Use provider export tools for backups larger than 64 MB.');
  for (const {id} of data.uploads) {
    checkedStorageKey(id);
    const object=await bucket.get(id);
    if (!object) throw new Error('Backup stopped: a photo is missing. Resolve storage consistency and retry.');
    const bytes=Buffer.from(await new Response(object.body).arrayBuffer());size+=bytes.length;
    if(size>64*1024*1024)throw new Error('Use provider export tools for backups larger than 64 MB.');
    images[id]={base64:bytes.toString('base64'),sha256:digest(bytes)};
  }
  const payload=Buffer.from(JSON.stringify({version:1,created:new Date().toISOString(),migrations:migrations().map(({name,sql})=>({name,sha256:digest(sql.replace(/\r\n/g,'\n'))})),data,images}));
  const cipher=createCipheriv('aes-256-gcm',secret,iv);
  const ciphertext=Buffer.concat([cipher.update(payload),cipher.final()]);
  return Buffer.from(JSON.stringify({format:'lost-found-encrypted-v1',salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')}));
}
export function restoreBackup(archive,password,directory) {
  const envelope=JSON.parse(archive.toString());
  if(envelope.format!=='lost-found-encrypted-v1')throw new Error('Unsupported backup.');
  const decipher=createDecipheriv('aes-256-gcm',key(password,Buffer.from(envelope.salt,'base64')),Buffer.from(envelope.iv,'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
  const payload=JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]).toString());
  if(payload.version!==1||!tables.every(table=>Array.isArray(payload.data?.[table])))throw new Error('Invalid backup data.');
  const current=migrations();
  if(JSON.stringify(payload.migrations)!==JSON.stringify(current.map(({name,sql})=>({name,sha256:digest(sql.replace(/\r\n/g,'\n'))}))))throw new Error('Restore using the same application migration version as the backup.');
  for(const {id} of payload.data.uploads){checkedStorageKey(id);const image=payload.images[id];if(!image||digest(Buffer.from(image.base64,'base64'))!==image.sha256)throw new Error('Backup photo integrity check failed.');}
  const target=path.resolve(directory);
  if(fs.existsSync(target))throw new Error('Restore destination must be a new directory. Existing data is never overwritten.');
  fs.mkdirSync(target,{recursive:true,mode:0o700});fs.mkdirSync(path.join(target,'uploads'),{mode:0o700});
  const sql=new DatabaseSync(path.join(target,'lost-found.sqlite'));
  try{
    sql.exec('PRAGMA foreign_keys=ON; CREATE TABLE local_migrations(name TEXT PRIMARY KEY); BEGIN IMMEDIATE;');
    for(const migration of current)sql.exec(migration.sql);
    for(const table of tables){if(table==='embedding_jobs')sql.exec('DELETE FROM embedding_jobs');const allowed=new Set(sql.prepare(`PRAGMA table_info("${table}")`).all().map(c=>c.name));for(const row of payload.data[table]){
      const columns=Object.keys(row);if(!columns.length||columns.some(column=>!allowed.has(column)))throw new Error('Invalid backup columns.');
      sql.prepare(`INSERT INTO "${table}" (${columns.map(c=>'"'+c+'"').join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...columns.map(c=>row[c]));
    }}
    if(sql.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Restored database has broken references.');
    for(const {id} of payload.data.uploads)fs.writeFileSync(path.join(target,'uploads',id),Buffer.from(payload.images[id].base64,'base64'),{flag:'wx',mode:0o600});
    sql.exec('COMMIT');
    if(sql.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Database integrity check failed.');
    return {directory:target,tables:tables.length,photos:payload.data.uploads.length};
  }catch(error){try{sql.exec('ROLLBACK');}catch{}throw error;}finally{sql.close();}
}
