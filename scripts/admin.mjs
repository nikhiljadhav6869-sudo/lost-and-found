import './load-env.mjs';
import fs from 'node:fs';
const [command,value]=process.argv.slice(2);
if(!['lookup','grant-local','verify'].includes(command)||!value)throw new Error('Usage: npm run admin -- lookup email | verify account-id | grant-local account-id');
const {DB,storageMode}=await import('../local/storage.mjs');
const user=await DB.prepare(command==='lookup'?'SELECT id,name,emailVerified FROM user WHERE lower(email)=lower(?)':'SELECT id,name,emailVerified FROM user WHERE id=?').bind(value).first();
if(!user)throw new Error('No matching account. Register in the intended deployment first.');
if(command==='lookup'){
  console.log(JSON.stringify(user,null,2));
  console.log('Confirm this is the intended verified account, then set its ID in Render ADMIN_USER_IDS.');
}else if(command==='verify'){
  const configured=(process.env.ADMIN_USER_IDS||'').split(',').map(x=>x.trim()).includes(user.id);
  console.log(JSON.stringify({id:user.id,emailVerified:!!user.emailVerified,configuredAdmin:configured},null,2));
  if(!configured||!user.emailVerified)process.exitCode=1;
}else{
  if(storageMode!=='local'||process.env.RENDER)throw new Error('Production admin access must be configured in the hosting environment.');
  if(!user.emailVerified)throw new Error('Verify the account email before granting administrator access.');
  if(!fs.existsSync('.dev.vars'))throw new Error('Run npm run setup:env first.');
  const source=fs.readFileSync('.dev.vars','utf8');
  const ids=new Set((process.env.ADMIN_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean));ids.add(user.id);
  const setting='ADMIN_USER_IDS='+[...ids].join(',');
  fs.writeFileSync('.dev.vars',/^ADMIN_USER_IDS=.*$/m.test(source)?source.replace(/^ADMIN_USER_IDS=.*$/m,setting):source+'\n'+setting+'\n');
  console.log('Local administrator configured. Restart the local server to apply.');
}
