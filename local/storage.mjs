import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
export const dataDirectory=path.resolve(process.env.DATA_DIR||'data');
fs.mkdirSync(dataDirectory,{recursive:true});
const sql=new DatabaseSync(path.join(dataDirectory,'lost-found.sqlite'));
sql.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
sql.exec('CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)');
for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort()){
 if(!sql.prepare('SELECT name FROM local_migrations WHERE name=?').get(file)){
  sql.exec('BEGIN');try{sql.exec(fs.readFileSync(path.join('drizzle',file),'utf8'));sql.prepare('INSERT INTO local_migrations(name) VALUES(?)').run(file);sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}
 }
}
if(process.env.SEED_DEMO!=='false')sql.exec(fs.readFileSync('seed/demo.sql','utf8'));
// Shape-compatible local implementations for the D1/R2 interfaces used by the app.
class Prepared{
 constructor(query,params=[]){this.query=query;this.params=params;}
 bind(...params){return new Prepared(this.query,params.map(x=>typeof x==='boolean'?Number(x):x??null));}
 execute(){const s=sql.prepare(this.query);if(s.columns().length){const results=s.all(...this.params);return {success:true,results,meta:{changes:0}};}const result=s.run(...this.params);return {success:true,results:[],meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};}
 async run(){return this.execute();}
 async all(){return this.execute();}
 async first(column){const row=sql.prepare(this.query).get(...this.params)||null;return column?row?.[column]??null:row;}
 async raw(){const s=sql.prepare(this.query);s.setReturnArrays(true);return s.all(...this.params);}
}
const DB={prepare:query=>new Prepared(query),async batch(statements){sql.exec('BEGIN IMMEDIATE');try{const out=statements.map(s=>s.execute());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const uploads=path.join(dataDirectory,'uploads');fs.mkdirSync(uploads,{recursive:true});
const fileFor=key=>{if(!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(key))throw new Error('Invalid storage key');return path.join(uploads,key);};
const BUCKET={async put(key,body,options){fs.writeFileSync(fileFor(key),new Uint8Array(body));},async get(key){const file=fileFor(key);if(!fs.existsSync(file))return null;return {body:fs.readFileSync(file),httpMetadata:{contentType:key.endsWith('.png')?'image/png':key.endsWith('.jpg')?'image/jpeg':'image/webp'}};},async delete(key){fs.rmSync(fileFor(key),{force:true});}};
export const env={DB,BUCKET,get SEED_DEMO(){return process.env.SEED_DEMO;},get BETTER_AUTH_SECRET(){return process.env.BETTER_AUTH_SECRET;},get ADMIN_USER_IDS(){return process.env.ADMIN_USER_IDS||'';}};
