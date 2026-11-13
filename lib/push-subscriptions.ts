import {z} from 'zod';
export function permittedPushEndpoint(value:string){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&((u.hostname==='fcm.googleapis.com'&&u.pathname.startsWith('/fcm/send/'))||(u.hostname==='updates.push.services.mozilla.com'&&u.pathname.startsWith('/wpush/'))||u.hostname==='web.push.apple.com');}catch{return false;}}
export async function pushRoute(db:D1Database,path:string[],method:string,b:Record<string,any>,userId:string,publicKey?:string){
 if(path[0]!=='push')return null;
 if(method==='GET')return {configured:!!publicKey,publicKey:publicKey||null,subscriptions:(await db.prepare('SELECT id FROM push_subscriptions WHERE userId=?').bind(userId).all()).results.length};
 if(method==='POST'){
  if(b.action==='disable'){const endpoint=z.string().max(3000).parse(b.endpoint);await db.prepare('DELETE FROM push_subscriptions WHERE userId=? AND endpoint=?').bind(userId,endpoint).run();return {ok:true};}
  if(!publicKey)throw Object.assign(Error('Background notifications are not configured. In-app updates remain available.'),{status:503});
  const input=z.object({endpoint:z.string().max(3000).refine(permittedPushEndpoint),keys:z.object({p256dh:z.string().regex(/^[A-Za-z0-9_-]{87}$/),auth:z.string().regex(/^[A-Za-z0-9_-]{22}$/)})}).parse(b.subscription);
  const count=await db.prepare('SELECT count(*) AS n FROM push_subscriptions WHERE userId=?').bind(userId).first<{n:number}>();if((count?.n||0)>=5&&!await db.prepare('SELECT 1 FROM push_subscriptions WHERE userId=? AND endpoint=?').bind(userId,input.endpoint).first())throw Object.assign(Error('Disable an old device before adding another.'),{status:400});
  await db.prepare('INSERT INTO push_subscriptions(id,userId,endpoint,p256dh,auth,created) VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET userId=excluded.userId,p256dh=excluded.p256dh,auth=excluded.auth,created=excluded.created').bind(crypto.randomUUID(),userId,input.endpoint,input.keys.p256dh,input.keys.auth,Date.now()).run();return {ok:true};
 }
 throw Object.assign(Error('Push action unavailable.'),{status:404});
}
