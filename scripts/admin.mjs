import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
const db=new DatabaseSync(path.resolve(process.env.DATA_DIR||'data','lost-found.sqlite'),{readOnly:true});
const target=process.argv[2];
if(!target||target==='list'){console.table(db.prepare('SELECT id,name,email FROM user ORDER BY createdAt').all());console.log('To grant local admin access: node scripts/admin.mjs ACCOUNT_ID');}
else{
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(target)||!db.prepare('SELECT id FROM user WHERE id=?').get(target))throw new Error('Use an existing account ID from the list.');
 const file='.dev.vars';if(!fs.existsSync(file))throw new Error('Run npm run setup:env first.');
 let text=fs.readFileSync(file,'utf8');const line=text.split(/\r?\n/).find(l=>l.startsWith('ADMIN_USER_IDS='))||'ADMIN_USER_IDS=';
 const ids=new Set(line.slice(15).split(',').filter(Boolean));ids.add(target);text=text.includes(line)?text.replace(line,'ADMIN_USER_IDS='+[...ids].join(',')):text+'\nADMIN_USER_IDS='+target+'\n';
 fs.writeFileSync(file,text);console.log('Local admin access configured. Restart the server to apply.');
}
db.close();
