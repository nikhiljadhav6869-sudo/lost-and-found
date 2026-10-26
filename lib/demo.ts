import {env} from 'cloudflare:workers';
import samples from '../seed/demo.json';
let ready=false;
// Idempotent DML bootstrap, separate from schema migrations. No accounts or claims are seeded.
export async function ensureDemo(){
 if(ready)return;
 const statements=samples.map(r=>env.DB!.prepare('INSERT OR IGNORE INTO reports(id,owner,type,title,category,description,colour,brand,date,location,privateDetails,images,status,demo,hidden,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...r));
 await env.DB!.batch(statements);ready=true;
}

export async function resetDemo() {
 const config=env as unknown as Record<string,string>;
 if(config.STORAGE_MODE!=='local'||config.SEED_DEMO!=='true')throw new Error('Demo reset is restricted to explicitly enabled local demo storage.');
 const fields=['id','owner','type','title','category','description','colour','brand','date','location','privateDetails','images','status','demo','hidden','created'];
 await env.DB!.batch(samples.map(r=>env.DB!.prepare('INSERT INTO reports('+fields.join(',')+') VALUES('+fields.map(()=>'?').join(',')+') ON CONFLICT(id) DO UPDATE SET '+fields.slice(1).map(k=>k+'=excluded.'+k).join(',')+" WHERE reports.demo=1 AND reports.owner='demo-community'").bind(...r)));
}
