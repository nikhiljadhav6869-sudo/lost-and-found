import {isolate} from './environment.mjs';
isolate('base');
import {build} from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
await build({entryPoints:['tests/entry.ts'],outfile:'.sites-runtime/test-entry.mjs',bundle:true,platform:'node',format:'esm',target:'node24',packages:'external',alias:{'cloudflare:workers':path.resolve('local/storage.mjs')}});
const dir=path.resolve('.sites-runtime','test-'+Date.now());fs.mkdirSync(dir,{recursive:true});
const env={...process.env,DATA_DIR:dir,BETTER_AUTH_SECRET:randomBytes(48).toString('base64url'),SEED_DEMO:'false'};
for(const stage of ['workflows','restart']){const result=spawnSync(process.execPath,['tests/workflows.mjs',stage],{env,stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
const regressions=spawnSync(process.execPath,['tests/regressions.mjs'],{env:{...env,DATA_DIR:dir+'-regressions'},stdio:'inherit'});if(regressions.status!==0)process.exit(regressions.status||1);
console.log('All integration and fresh-process persistence checks passed. Test data remains isolated under .sites-runtime.');
