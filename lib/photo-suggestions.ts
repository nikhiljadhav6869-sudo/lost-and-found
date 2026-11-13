import {z} from 'zod';
import {categories} from './matching';
export const photoSuggestionSchema=z.object({title:z.string().max(100),category:z.string().refine(c=>categories.includes(c)),colour:z.string().max(50),features:z.array(z.string().max(80)).max(4),description:z.string().max(2000)});
export async function photoSuggestionRoute(db:D1Database,path:string[],method:string,b:Record<string,any>,userId:string){
 const reject=(message:string,status=400):never=>{throw Object.assign(Error(message),{status});};
 if(path[0]!=='photo-suggestions')return null;
 if(method==='POST'){
  const image=z.string().regex(/^\/api\/media\/[a-f0-9-]+\.(jpg|png|webp)$/).parse(b.image);
  if(!await db.prepare('SELECT 1 FROM uploads WHERE id=? AND owner=?').bind(image.slice(11),userId).first())reject('Choose your own uploaded photo.',403);
  const existing=await db.prepare('SELECT id,state,created FROM photo_suggestions WHERE userId=? AND image=?').bind(userId,image).first<any>();
  if(existing&&existing.created>Date.now()-86400000)return {id:existing.id,state:existing.state};
  const pending=await db.prepare("SELECT count(*) AS n FROM photo_suggestions WHERE userId=? AND state IN ('pending','running') AND created>?").bind(userId,Date.now()-86400000).first<any>();
  if(pending.n>=3)reject('Please wait for your current photo suggestions.',429);
  const id=crypto.randomUUID();
  await db.prepare("INSERT INTO photo_suggestions(id,userId,image,created) VALUES(?,?,?,?) ON CONFLICT(userId,image) DO UPDATE SET id=excluded.id,state='pending',attempts=0,available=0,lease=NULL,result=NULL,created=excluded.created WHERE photo_suggestions.created<=?").bind(id,userId,image,Date.now(),Date.now()-86400000).run();
  const job=await db.prepare('SELECT id,state FROM photo_suggestions WHERE userId=? AND image=?').bind(userId,image).first();return job;
 }
 if(method==='GET'&&path[1]){
  const row=await db.prepare('SELECT * FROM photo_suggestions WHERE id=? AND userId=? AND created>?').bind(path[1],userId,Date.now()-86400000).first<any>();
  if(!row)reject('Photo suggestions are unavailable or expired.',404);
  const failed=row.attempts>=3&&row.available<=Date.now()&&row.state!=='ready';
  return {id:row.id,state:failed?'failed':row.state,suggestions:row.state==='ready'?photoSuggestionSchema.parse(JSON.parse(row.result)):null};
 }
 reject('This action is unavailable.',404);
}
