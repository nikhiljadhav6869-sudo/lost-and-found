import fs from 'node:fs';
if(fs.existsSync('.dev.vars')){for(const line of fs.readFileSync('.dev.vars','utf8').split(/\r?\n/)){if(!line||line.startsWith('#'))continue;const at=line.indexOf('=');if(at>0&&!(line.slice(0,at) in process.env))process.env[line.slice(0,at)]=line.slice(at+1).replace(/^['"]|['"]$/g,'');}}
if(!process.env.BETTER_AUTH_SECRET||process.env.BETTER_AUTH_SECRET.length<32)throw new Error('Run npm run setup:env or set BETTER_AUTH_SECRET.');
await import('../dist/local-server.mjs');
