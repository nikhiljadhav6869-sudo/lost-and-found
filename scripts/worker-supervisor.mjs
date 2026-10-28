import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {storageConfiguration} from '../local/storage-config.mjs';

const keys = ['STORAGE_MODE','TURSO_DATABASE_URL','TURSO_AUTH_TOKEN','SUPABASE_URL','SUPABASE_SECRET_KEY','SUPABASE_STORAGE_BUCKET'];
export function checkedWorkerConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config) || Object.keys(config).length !== keys.length || Object.keys(config).some(key => !keys.includes(key))) throw new Error('Worker configuration must contain only the six remote-storage settings.');
  if (keys.some(key => typeof config[key] !== 'string' || !config[key] || config[key].length > 16000 || /[\r\n\0]/.test(config[key]))) throw new Error('Invalid worker configuration values.');
  if (config.STORAGE_MODE !== 'remote') throw new Error('Worker requires remote storage.');
  storageConfiguration(config);
  return Object.fromEntries(keys.map(key => [key,config[key]]));
}
export function safeWorkerEvent(line) {
  try {
    const event = JSON.parse(line);
    if (event.event === 'worker_batch' && ['reports','searches'].every(key => Number.isSafeInteger(event[key]) && event[key] >= 0 && event[key] <= 100)) return {event:'worker_batch',reports:event.reports,searches:event.searches};
  } catch {}
  return null;
}
export function retryDelay(failures) { return Math.min(900000,15000 * 2 ** Math.max(0,failures - 1)); }

async function readConfig() {
  const chunks=[]; let size=0;
  for await (const chunk of process.stdin) { size+=chunk.length; if(size>65536) throw new Error('Configuration input too large.'); chunks.push(chunk); }
  return checkedWorkerConfig(JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/,'')));
}
async function main() {
  const config=await readConfig();
  if(process.argv.includes('--validate')) { process.stdout.write('{"valid":true}\n'); return; }
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const profile=process.argv[2];
  if(!/^windows-worker(?:-[a-zA-Z0-9_-]+)?$/.test(profile || '')) throw new Error('Invalid worker profile.');
  const directory=path.join(root,'.sites-runtime',profile);
  fs.mkdirSync(directory,{recursive:true});
  // The Windows launcher's current-user/project/profile mutex owns exclusion.
  // Ignore legacy PID lock files: a reused PID must never suppress recovery.
  const logFile=path.join(directory,'worker.log');
  const log=event=>{
    try {
      if(fs.existsSync(logFile) && fs.statSync(logFile).size>262144) {fs.rmSync(logFile+'.1',{force:true});fs.renameSync(logFile,logFile+'.1');}
      fs.appendFileSync(logFile,JSON.stringify({time:new Date().toISOString(),...event})+'\n',{mode:0o600});
    } catch {}
  };
  const childEnv={};
  for(const key of ['PATH','Path','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','HOMEDRIVE','HOMEPATH']) if(process.env[key]) childEnv[key]=process.env[key];
  Object.assign(childEnv,config,{SEED_DEMO:'false'});
  let stopping=false,child,timer,wake;
  const stop=()=>{stopping=true;clearTimeout(timer);wake?.();child?.kill();};
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
  let failures=0;
  log({event:'supervisor_started'});
  while(!stopping) {
    const started=Date.now();
    child=spawn(process.execPath,['scripts/ai-worker.mjs','--watch'],{cwd:root,env:childEnv,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let pending='';
    child.stdout.on('data',chunk=>{
      pending+=chunk.toString();
      // Discard oversized/non-JSON output instead of recording model or provider errors.
      if(pending.length>8192)pending='';
      let index;
      while((index=pending.indexOf('\n'))>=0){const safe=safeWorkerEvent(pending.slice(0,index));pending=pending.slice(index+1);if(safe)log(safe);}
    });
    child.stderr.resume();
    const code=await new Promise(resolve=>{child.once('error',()=>resolve(-1));child.once('close',value=>resolve(value));});
    child=null;
    if(stopping)break;
    if(Date.now()-started>=300000)failures=0;
    failures++;
    log({event:'worker_exited',code:Number.isInteger(code)?code:-1,consecutiveFailures:failures});
    if(failures>=8){log({event:'restart_limit_reached'});process.exitCode=1;break;}
    const delay=retryDelay(failures);log({event:'worker_retry',delaySeconds:delay/1000});
    await new Promise(resolve=>{wake=resolve;timer=setTimeout(resolve,delay);});wake=null;
  }
  log({event:'supervisor_stopped'});
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(()=>{process.stderr.write('Worker supervisor stopped: check protected configuration and installation.\n');process.exitCode=1;});
