import './load-env.mjs';
import path from 'node:path';
import {build} from 'esbuild';
import {storageConfiguration} from '../local/storage-config.mjs';
if(storageConfiguration().mode!=='local'||process.env.SEED_DEMO!=='true')throw new Error('Use an explicitly enabled local demo environment; production reset is not allowed.');
await build({entryPoints:['lib/demo.ts'],outfile:'.sites-runtime/demo-reset.mjs',bundle:true,platform:'node',format:'esm',alias:{'cloudflare:workers':path.resolve('local/storage.mjs')},packages:'external'});
const {resetDemo}=await import('../.sites-runtime/demo-reset.mjs');
await resetDemo();console.log('Known local sample listings restored. Genuine reports and accounts were preserved.');
