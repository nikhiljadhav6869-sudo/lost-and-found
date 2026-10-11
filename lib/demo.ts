import {env} from 'cloudflare:workers';
import samples from '../seed/demo.json';
let ready=false;
// Idempotent DML bootstrap, separate from schema migrations. No accounts or claims are seeded.
export async function ensureDemo(){
 if(ready)return;
 const statements=samples.map(r=>env.DB!.prepare('INSERT OR IGNORE INTO reports(id,owner,type,title,category,description,colour,brand,date,location,privateDetails,images,status,demo,hidden,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(...r));
 await env.DB!.batch(statements);ready=true;
}
