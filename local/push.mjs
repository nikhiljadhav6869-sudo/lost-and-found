import * as webpush from 'web-push';
import {DB} from './storage.mjs';
const configured=()=>process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT;
export async function processPushJobs(count=10,send=webpush.sendNotification){
 if(!configured())return 0;
 let sent=0;
 for(let i=0;i<Math.min(count,30);i++){
  const lease=crypto.randomUUID(),time=Date.now();
  const job=await DB.prepare("UPDATE push_deliveries SET state='running',lease=?,attempts=attempts+1,available=? WHERE rowid=(SELECT rowid FROM push_deliveries WHERE state IN ('pending','running','failed') AND attempts<3 AND available<=? LIMIT 1) RETURNING *").bind(lease,time+120000,time).first();if(!job)break;
  const finish=state=>DB.prepare('UPDATE push_deliveries SET state=?,lease=NULL WHERE notificationId=? AND subscriptionId=? AND lease=?').bind(state,job.notificationId,job.subscriptionId,lease).run();
  const row=await DB.prepare('SELECT s.*,n.read,n.created AS noticeCreated,n.body,n.link FROM push_subscriptions s JOIN notifications n ON n.userId=s.userId WHERE s.id=? AND n.id=?').bind(job.subscriptionId,job.notificationId).first();
  if(!row||row.read||row.noticeCreated<time-86400000){await finish('skipped');continue;}
  const prefs=await DB.prepare('SELECT pushMatches,pushClaims FROM preferences WHERE userId=?').bind(row.userId).first();if(row.body.startsWith('Strong match')?prefs?.pushMatches===0:prefs?.pushClaims===0){await finish('skipped');continue;}
  // Generic payload avoids disclosing report titles or private claim details on lock screens.
  try{
   await send({endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}},JSON.stringify({title:'Lost & Found',body:'You have a new update. Open the app to view it.',tag:job.notificationId,url:'/'}),{TTL:3600,timeout:10000,vapidDetails:{subject:process.env.VAPID_SUBJECT,publicKey:process.env.VAPID_PUBLIC_KEY,privateKey:process.env.VAPID_PRIVATE_KEY}});
   await finish('sent');sent++;
  }catch(error){if([404,410].includes(error.statusCode))await DB.prepare('DELETE FROM push_subscriptions WHERE id=?').bind(row.id).run();else await DB.prepare("UPDATE push_deliveries SET state='failed',available=?,lease=NULL WHERE notificationId=? AND subscriptionId=? AND lease=?").bind(time+60000*2**job.attempts,job.notificationId,job.subscriptionId,lease).run();}
 }
 return sent;
}
