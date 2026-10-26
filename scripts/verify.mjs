import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const checks=[
 ['TypeScript',['node_modules/typescript/bin/tsc','--noEmit']],
 ['Production build',['scripts/build-local.mjs']],
 ['Workflows and persistence',['tests/run.mjs']],
 ['HTTP',['tests/run-http.mjs']],
 ['PWA privacy',['tests/pwa.mjs']],
 ['Upgrade safeguards',['tests/upgrades.mjs']],
 ['Authentication recovery',['tests/auth-recovery.mjs']],
 ['Storage transactions',['tests/storage.mjs']],
 ['Intelligence and search',['tests/intelligence.mjs']],
 ['Connection handling',['tests/request.mjs']],
 ['Backup storage',['tests/backup-storage.mjs']],
 ['Browser workflows',['tests/browser.mjs']]
];
const results=[];
for(const [name,args] of checks){const start=performance.now();const result=spawnSync(process.execPath,args,{stdio:'inherit'});results.push({name,passed:result.status===0,ms:Math.round(performance.now()-start)});}
const report={executedAt:new Date().toISOString(),checks:results};
fs.mkdirSync('.sites-runtime',{recursive:true});
fs.writeFileSync('.sites-runtime/verification.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
process.exit(results.every(r=>r.passed)?0:1);
