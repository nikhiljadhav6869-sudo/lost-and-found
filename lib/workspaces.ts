import {z} from 'zod';
type Row=Record<string,any>;
function reject(message:string,status=403):never{throw Object.assign(Error(message),{status});}
export async function digest(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
export const memberRole=async(db:D1Database,workspaceId:string,userId:string)=> (await db.prepare('SELECT role FROM workspace_members WHERE workspaceId=? AND userId=?').bind(workspaceId,userId).first<Row>())?.role;
export async function requireWorkspace(db:D1Database,workspaceId:string|null|undefined,userId:string|undefined,platform=false,roles=['student','staff','admin']){
 if(!workspaceId)return;
 if(platform)return;
 if(!userId||!roles.includes(await memberRole(db,workspaceId,userId)))reject('This college workspace is unavailable.',404);
}
export const canStaff=async(db:D1Database,workspaceId:string|null,userId:string)=>!!workspaceId&&['staff','admin'].includes(await memberRole(db,workspaceId,userId));
export async function workspaceRoute(db:D1Database,path:string[],method:string,b:Row,user:Row,platform:boolean){
 if(path[0]!=='workspaces'&&path[0]!=='collection')return null;
 const one=(sql:string,...p:any[])=>db.prepare(sql).bind(...p).first<Row>();
 const all=async(sql:string,...p:any[])=>(await db.prepare(sql).bind(...p).all<Row>()).results;
 const audit=(wid:string,event:string,detail='',rid:string|null=null,recipient:string|null=null)=>db.prepare('INSERT INTO handover_events(id,workspaceId,reportId,actor,recipient,event,detail,created) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),wid,rid,user.id,recipient,event,detail,Date.now());
 const notify=(uid:string,body:string,link:string)=>db.prepare('INSERT INTO notifications(id,userId,body,link,created) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),uid,body,link,Date.now());
 if(path[0]==='collection'){
  const c=await one('SELECT c.*,r.workspaceId,r.hidden,r.owner,r.status AS reportStatus,k.returnedAt FROM claims c JOIN reports r ON r.id=c.reportId JOIN custody k ON k.reportId=r.id WHERE c.id=?',path[1]);
  if(!c)reject('Collection unavailable.',404);
  await requireWorkspace(db,c.workspaceId,user.id,platform);
  const staff=platform||await canStaff(db,c.workspaceId,user.id);
  if(c.claimant!==user.id&&!staff)reject('Collection unavailable.',403);
  if(method==='GET')return {managed:true,status:c.status,history:await all('SELECT event,created FROM handover_events WHERE reportId=? ORDER BY created',c.reportId)};
  if(c.status!=='Approved'||c.reportStatus!=='Return Arranged'||c.hidden||c.returnedAt)reject('The approved item is not ready for collection.',409);
  if(await one('SELECT 1 FROM blocks WHERE (userId=? AND blocked=?) OR (userId=? AND blocked=?)',c.owner,c.claimant,c.claimant,c.owner))reject('Resolve participant blocks before collection.',403);
  if(method==='POST'&&b.action==='issue'){
   if(c.claimant!==user.id)reject('Only the approved owner can request a collection code.');
   const bytes=crypto.getRandomValues(new Uint32Array(1)),code=String(bytes[0]%100000000).padStart(8,'0'),salt=crypto.randomUUID(),expires=Date.now()+10*60000;
   const result=await db.batch([
    db.prepare(`INSERT INTO collection_codes(claimId,salt,codeHash,expires) SELECT c.id,?,?,? FROM claims c JOIN reports r ON r.id=c.reportId JOIN custody k ON k.reportId=r.id WHERE c.id=? AND c.claimant=? AND c.status='Approved' AND r.status='Return Arranged' AND r.hidden=0 AND k.returnedAt IS NULL AND EXISTS(SELECT 1 FROM workspace_members WHERE workspaceId=r.workspaceId AND userId=c.claimant) AND NOT EXISTS(SELECT 1 FROM blocks WHERE (userId=r.owner AND blocked=c.claimant) OR (userId=c.claimant AND blocked=r.owner)) ON CONFLICT(claimId) DO UPDATE SET salt=excluded.salt,codeHash=excluded.codeHash,expires=excluded.expires,attempts=0,consumedAt=NULL,receipt=NULL`).bind(salt,await digest(salt+code),expires,c.id,user.id),
    db.prepare("INSERT INTO handover_events(id,workspaceId,reportId,actor,recipient,event,detail,created) SELECT ?,?,?,?,?,'collection-code-issued','',? WHERE changes()=1").bind(crypto.randomUUID(),c.workspaceId,c.reportId,user.id,c.claimant,Date.now())
   ]);
   if(!result[0].meta.changes)reject('The collection arrangement changed. Refresh before requesting another code.',409);
   return {code,expires};
  }
  if(method==='POST'&&b.action==='collect'){
   if(!staff)reject('Only college staff can complete collection.');
   if(c.claimant===user.id)reject('Another staff member must hand over your item.');
   const code=z.string().regex(/^\d{8}$/).parse(b.code),stored=await one('SELECT salt FROM collection_codes WHERE claimId=?',c.id);
   if(!stored)reject('Request a new collection code.',400);
   const receipt=crypto.randomUUID(),time=Date.now(),hash=await digest(stored.salt+code);
   const completed=await db.batch([
    db.prepare(`UPDATE collection_codes SET attempts=attempts+1,consumedAt=CASE WHEN codeHash=? THEN ? ELSE NULL END,receipt=CASE WHEN codeHash=? THEN ? ELSE NULL END WHERE claimId=? AND consumedAt IS NULL AND expires>? AND attempts<5 AND EXISTS(SELECT 1 FROM claims c JOIN reports r ON r.id=c.reportId WHERE c.id=? AND c.status='Approved' AND r.status='Return Arranged' AND r.hidden=0 AND NOT EXISTS(SELECT 1 FROM blocks WHERE (userId=r.owner AND blocked=c.claimant) OR (userId=c.claimant AND blocked=r.owner)) AND EXISTS(SELECT 1 FROM workspace_members WHERE workspaceId=r.workspaceId AND userId=c.claimant)) AND (?=1 OR EXISTS(SELECT 1 FROM workspace_members WHERE workspaceId=? AND userId=? AND role IN ('staff','admin'))) RETURNING receipt`).bind(hash,time,hash,receipt,c.id,time,c.id,Number(platform),c.workspaceId,user.id),
    db.prepare("UPDATE claims SET status='Returned',finderConfirmed=1,claimantConfirmed=1 WHERE id=? AND status='Approved' AND EXISTS(SELECT 1 FROM collection_codes WHERE claimId=? AND receipt=?)").bind(c.id,c.id,receipt),
    db.prepare("UPDATE reports SET status='Returned' WHERE id=? AND EXISTS(SELECT 1 FROM collection_codes WHERE claimId=? AND receipt=?)").bind(c.reportId,c.id,receipt),
    db.prepare('UPDATE custody SET returnedAt=? WHERE reportId=? AND EXISTS(SELECT 1 FROM collection_codes WHERE claimId=? AND receipt=?)').bind(time,c.reportId,c.id,receipt),
    db.prepare("UPDATE claims SET status='Rejected' WHERE reportId=? AND status='Pending' AND EXISTS(SELECT 1 FROM collection_codes WHERE claimId=? AND receipt=?)").bind(c.reportId,c.id,receipt),
    db.prepare("INSERT INTO handover_events(id,workspaceId,reportId,actor,recipient,event,detail,created) SELECT ?,?,?,?,?, 'collected','',? WHERE EXISTS(SELECT 1 FROM collection_codes WHERE claimId=? AND receipt=?)").bind(receipt,c.workspaceId,c.reportId,user.id,c.claimant,time,c.id,receipt),
    db.prepare("INSERT INTO notifications(id,userId,body,link,created) SELECT ?,?,'Your item collection was confirmed.',?,? WHERE EXISTS(SELECT 1 FROM collection_codes WHERE claimId=? AND receipt=?)").bind(crypto.randomUUID(),c.claimant,'/?claim='+c.id,time,c.id,receipt),
    db.prepare("INSERT INTO notifications(id,userId,body,link,created) SELECT ?,?,'The item you found was collected by its approved owner.',?,? WHERE EXISTS(SELECT 1 FROM collection_codes WHERE claimId=? AND receipt=?)").bind(crypto.randomUUID(),c.owner,'/?claim='+c.id,time,c.id,receipt),
   ]);
   if((completed[0].results?.[0] as Row)?.receipt!==receipt)reject('Invalid, expired, locked or already-used code. Ask the owner to request a new code.',400);
   return {ok:true};
  }
  reject('Collection action unavailable.',404);
 }
 if(!path[1]&&method==='GET')return {workspaces:platform?await all("SELECT w.id,w.name,'platform' AS role FROM workspaces w ORDER BY name"):await all('SELECT w.id,w.name,m.role FROM workspaces w JOIN workspace_members m ON m.workspaceId=w.id WHERE m.userId=? ORDER BY w.name',user.id)};
 if(!path[1]&&method==='POST'){
  if(!platform)reject('A platform administrator must create the college workspace.');
  const input=z.object({name:z.string().trim().min(3).max(100),administrator:z.string().email()}).parse(b);
  const target=await one('SELECT id FROM user WHERE email=? COLLATE NOCASE AND emailVerified=1',input.administrator);
  if(!target)reject('The college administrator needs a verified account first.',400);
  const id=crypto.randomUUID();await db.batch([db.prepare('INSERT INTO workspaces(id,name,created) VALUES(?,?,?)').bind(id,input.name,Date.now()),db.prepare("INSERT INTO workspace_members(workspaceId,userId,role) VALUES(?,?,'admin')").bind(id,target.id),audit(id,'workspace-created')]);return {id};
 }
 if(path[1]==='join'&&method==='POST'){
  const code=z.string().min(20).max(100).parse(b.code),workspace=await one('SELECT id FROM workspaces WHERE inviteHash=?',await digest(code));
  if(!workspace)reject('This invitation is invalid.',400);
  if(!user.emailVerified)reject('Verify your email before joining a college.',403);
  await db.batch([db.prepare("INSERT OR IGNORE INTO workspace_members(workspaceId,userId,role) VALUES(?,?,'student')").bind(workspace.id,user.id),audit(workspace.id,'member-joined')]);return {id:workspace.id};
 }
 const wid=path[1];await requireWorkspace(db,wid,user.id,platform);
 const role=platform?'platform':await memberRole(db,wid,user.id),admin=platform||role==='admin',staff=admin||role==='staff';
 const workspace=await one('SELECT id,name FROM workspaces WHERE id=?',wid);if(!workspace)reject('College unavailable.',404);
 if(path[2]==='desks'&&method==='GET')return {desks:await all('SELECT id,name,location FROM collection_desks WHERE workspaceId=? ORDER BY name',wid)};
 if(!path[2]&&method==='GET')return {workspace,role,counts:await one("SELECT count(*) AS reports,(SELECT count(*) FROM claims c JOIN reports r ON r.id=c.reportId WHERE r.workspaceId=reports.workspaceId AND r.hidden=0 AND c.status='Pending') AS pending,coalesce(sum(status='Returned'),0) AS returned FROM reports WHERE workspaceId=? AND demo=0 AND hidden=0",wid),matched:await one('SELECT count(DISTINCT r.id) AS count FROM reports r JOIN match_alerts m ON r.id=m.reportA OR r.id=m.reportB WHERE r.workspaceId=? AND r.hidden=0',wid),desks:await all('SELECT id,name,location FROM collection_desks WHERE workspaceId=?',wid),...(staff?{reports:await all('SELECT r.id,r.title,r.type,r.status,k.storage,k.receivedBy,k.deskId FROM reports r LEFT JOIN custody k ON k.reportId=r.id WHERE r.workspaceId=? AND r.hidden=0 ORDER BY r.created DESC LIMIT 100',wid),claims:await all("SELECT c.id,c.reportId,c.status,c.evidence,r.title FROM claims c JOIN reports r ON r.id=c.reportId JOIN custody k ON k.reportId=r.id WHERE r.workspaceId=? AND r.hidden=0 AND c.status IN ('Pending','Approved') ORDER BY c.created LIMIT 100",wid),history:await all('SELECT e.id,e.event,e.reportId,e.actor,e.recipient,e.detail,e.created FROM handover_events e WHERE e.workspaceId=? ORDER BY e.created DESC LIMIT 100',wid)}:{}),...(admin?{members:await all('SELECT m.userId,m.role,u.name,u.email FROM workspace_members m JOIN user u ON u.id=m.userId WHERE m.workspaceId=?',wid)}:{})};
 if(path[2]==='invite'&&method==='POST'){
  if(!admin)reject('College administrator access required.');const code=crypto.randomUUID()+crypto.randomUUID();await db.batch([db.prepare('UPDATE workspaces SET inviteHash=? WHERE id=?').bind(await digest(code),wid),audit(wid,'invitation-rotated')]);return {code};
 }
 if(path[2]==='members'&&method==='POST'){
  if(!admin)reject('College administrator access required.');const input=z.object({email:z.string().email(),role:z.enum(['student','staff','admin'])}).parse(b);
  const target=await one('SELECT id FROM user WHERE email=? COLLATE NOCASE AND emailVerified=1',input.email);if(!target)reject('The member needs a verified account first.',400);
  if(target.id===user.id&&input.role!=='admin'&&!platform)reject('Ask another administrator to change your own role.',400);
  await db.batch([db.prepare('INSERT INTO workspace_members(workspaceId,userId,role) VALUES(?,?,?) ON CONFLICT(workspaceId,userId) DO UPDATE SET role=excluded.role').bind(wid,target.id,input.role),audit(wid,'member-role-changed',input.role,null,target.id)]);return {ok:true};
 }
 if(path[2]==='desks'&&method==='POST'){
  if(!staff)reject('College staff access required.');const input=z.object({name:z.string().trim().min(2).max(80),location:z.string().trim().min(2).max(100)}).parse(b),id=crypto.randomUUID();await db.batch([db.prepare('INSERT INTO collection_desks(id,workspaceId,name,location) VALUES(?,?,?,?)').bind(id,wid,input.name,input.location),audit(wid,'desk-created',input.name)]);return {id};
 }
 if(path[2]==='receive'&&method==='POST'){
  if(!staff)reject('College staff access required.');const input=z.object({reportId:z.string().uuid(),deskId:z.string().uuid(),storage:z.string().trim().min(2).max(100)}).parse(b);
  const report=await one("SELECT * FROM reports WHERE id=? AND workspaceId=? AND type='found' AND demo=0 AND hidden=0 AND status IN ('Open','Claim Pending')",input.reportId,wid);
  if(!report||!await one('SELECT 1 FROM collection_desks WHERE id=? AND workspaceId=?',input.deskId,wid))reject('Report or collection desk unavailable.',400);
  if(await one('SELECT 1 FROM custody WHERE reportId=?',report.id))reject('This item is already in staff custody.',409);
  const time=Date.now(),eventId=crypto.randomUUID();
  const result=await db.batch([
   db.prepare("INSERT OR IGNORE INTO custody(reportId,deskId,storage,receivedBy,receivedFrom,receivedAt) SELECT id,?,?,?,?,? FROM reports WHERE id=? AND workspaceId=? AND type='found' AND demo=0 AND hidden=0 AND status IN ('Open','Claim Pending') AND (?=1 OR EXISTS(SELECT 1 FROM workspace_members WHERE workspaceId=? AND userId=? AND role IN ('staff','admin')))").bind(input.deskId,input.storage,user.id,report.owner,time,report.id,wid,Number(platform),wid,user.id),
   db.prepare("INSERT INTO handover_events(id,workspaceId,reportId,actor,recipient,event,detail,created) SELECT ?,?,?,?,?,'received',?,? WHERE changes()=1").bind(eventId,wid,report.id,user.id,report.owner,input.storage,time),
   db.prepare("INSERT INTO notifications(id,userId,body,link,created) SELECT ?,?,'College staff received your found item.',?,? WHERE EXISTS(SELECT 1 FROM handover_events WHERE id=?)").bind(crypto.randomUUID(),report.owner,'/?report='+report.id,time,eventId)
  ]);
  if(!result[0].meta.changes)reject('This item changed before staff received it. Refresh and try again.',409);
  return {ok:true};
 }
 if(path[2]==='move'&&method==='POST'){
  if(!staff)reject('College staff access required.');const input=z.object({reportId:z.string().uuid(),deskId:z.string().uuid(),storage:z.string().trim().min(2).max(100)}).parse(b);
  if(!await one('SELECT 1 FROM custody k JOIN reports r ON r.id=k.reportId WHERE r.id=? AND r.workspaceId=? AND k.returnedAt IS NULL',input.reportId,wid)||!await one('SELECT 1 FROM collection_desks WHERE id=? AND workspaceId=?',input.deskId,wid))reject('Storage record unavailable.',404);
  const result=await db.batch([db.prepare("UPDATE custody SET deskId=?,storage=? WHERE reportId=? AND returnedAt IS NULL AND (?=1 OR EXISTS(SELECT 1 FROM workspace_members WHERE workspaceId=? AND userId=? AND role IN ('staff','admin')))").bind(input.deskId,input.storage,input.reportId,Number(platform),wid,user.id),db.prepare("INSERT INTO handover_events(id,workspaceId,reportId,actor,event,detail,created) SELECT ?,?,?,?,'storage-moved',?,? WHERE changes()=1").bind(crypto.randomUUID(),wid,input.reportId,user.id,input.storage,Date.now())]);if(!result[0].meta.changes)reject('This storage record changed. Refresh and try again.',409);return {ok:true};
 }
 reject('Workspace action unavailable.',404);
}
