import {isolate} from './environment.mjs';
isolate('base');
import {build} from 'esbuild';
import path from 'node:path';
import {randomBytes} from 'node:crypto';

// Run separately from socket-free handler tests so restricted environments can
// still verify the database workflows. Socket failures remain failures here.
process.env.DATA_DIR = path.resolve('.sites-runtime','http-'+Date.now());
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString('base64url');
process.env.SEED_DEMO = 'false';
process.env.PORT = process.env.TEST_PORT || '3001';
process.env.HOST = '127.0.0.1';
process.env.APP_ORIGIN = `http://127.0.0.1:${process.env.PORT}`;
await build({entryPoints:['local/server.mjs'],outfile:'.sites-runtime/http-server.mjs',bundle:true,platform:'node',format:'esm',target:'node24',packages:'external',alias:{'cloudflare:workers':path.resolve('local/storage.mjs')}});
await import('./http.mjs');
