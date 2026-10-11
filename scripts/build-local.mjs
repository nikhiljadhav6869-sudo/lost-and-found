import fs from 'node:fs';
import path from 'node:path';
// Use Node's ordinary path resolver on Windows hosts whose native resolver fails.
if(process.platform==='win32'){const native=fs.realpathSync.native;fs.realpathSync.native=(...args)=>{try{return native(...args);}catch(e){if(e.code!=='EPERM')throw e;return fs.realpathSync(...args);}};}
const {build}=await import('vite');
const {default:react}=await import('@vitejs/plugin-react');
await build({configFile:false,root:'local',publicDir:path.resolve('public'),plugins:[react()],build:{outDir:path.resolve('dist/local'),emptyOutDir:true},css:{postcss:path.resolve('.')}});
const esbuild=await import('esbuild');
await esbuild.build({entryPoints:['local/server.mjs'],outfile:'dist/local-server.mjs',bundle:true,platform:'node',format:'esm',target:'node24',packages:'external',alias:{'cloudflare:workers':path.resolve('local/storage.mjs')}});
console.log('Portable application built: dist/local and dist/local-server.mjs');
