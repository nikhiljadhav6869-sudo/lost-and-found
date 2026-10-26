import {isolate} from './environment.mjs';
isolate('browser');
Object.assign(process.env,{PORT:'3002',HOST:'127.0.0.1',APP_ORIGIN:'http://127.0.0.1:3002',SEED_DEMO:'true'});
await import('../dist/local-server.mjs');
