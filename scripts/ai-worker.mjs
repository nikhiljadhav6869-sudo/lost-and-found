import './load-env.mjs';
import path from 'node:path';
import { build } from 'esbuild';
import { embed } from '../ai-worker/models.mjs';
await build({ entryPoints:['lib/ai-jobs.ts'], outfile:'.sites-runtime/ai-jobs.mjs', bundle:true, platform:'node', format:'esm', target:'node24', packages:'external', alias:{'cloudflare:workers':path.resolve('local/storage.mjs')} });
const {processEmbeddingJobs,processSearchJobs,workerHeartbeat} = await import('../.sites-runtime/ai-jobs.mjs');
let stopping = false;
let lastHeartbeat = 0;
process.on('SIGTERM',()=>{stopping=true;}); process.on('SIGINT',()=>{stopping=true;});
do {
    // Five-minute heartbeats fit the fifteen-minute availability window without
    // adding thousands of operational records per day on the free database.
    if (Date.now() - lastHeartbeat >= 300000) {
        await workerHeartbeat();
        lastHeartbeat = Date.now();
    }
    const reports=await processEmbeddingJobs(embed,10), searches=await processSearchJobs(embed,5);
    console.log(JSON.stringify({event:'worker_batch',reports,searches}));
    if (!process.argv.includes('--watch') || stopping) break;
    await new Promise(resolve=>setTimeout(resolve,15000));
} while (!stopping);
