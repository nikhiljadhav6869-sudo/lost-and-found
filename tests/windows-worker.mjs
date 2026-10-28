import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {checkedWorkerConfig,safeWorkerEvent,retryDelay} from '../scripts/worker-supervisor.mjs';
import {testWindowsMutex} from './windows-worker-mutex.mjs';

const config={STORAGE_MODE:'remote',TURSO_DATABASE_URL:'libsql://worker-test.example.com',TURSO_AUTH_TOKEN:'synthetic-token-not-a-credential',SUPABASE_URL:'https://worker-test.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_synthetic_test_only',SUPABASE_STORAGE_BUCKET:'test-private-photos'};
assert.deepEqual(checkedWorkerConfig(config),config);
for(const invalid of [{...config,STORAGE_MODE:'local'},{...config,NODE_OPTIONS:'--inspect'},{...config,SUPABASE_SECRET_KEY:'sb_publishable_example'},{...config,TURSO_DATABASE_URL:'http://example.com'},{...config,TURSO_AUTH_TOKEN:'bad\nvalue'},[]]) assert.throws(()=>checkedWorkerConfig(invalid));
assert.deepEqual(safeWorkerEvent('{"event":"worker_batch","reports":1,"searches":2,"secret":"not-logged"}'),{event:'worker_batch',reports:1,searches:2});
for(const line of ['provider failed with a private token','{"event":"worker_batch","reports":-1,"searches":0}','{"event":"error","secret":"not-logged"}','not json']) assert.equal(safeWorkerEvent(line),null);
assert.equal(retryDelay(1),15000);assert.equal(retryDelay(8),900000);assert.equal(retryDelay(100),900000);
console.log('PASS worker config allowlist, sanitized events and bounded backoff');

if(process.platform==='win32') {
  const root=process.cwd(),profile='windows-worker-test-'+randomUUID(),runtime=path.resolve(root,'.sites-runtime',profile),protectedFile=path.join(runtime,'credentials.dpapi');
  const shell=process.env.WORKER_TEST_POWERSHELL || path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  await testWindowsMutex(shell,root);
  const invoke=(action,input='',args=[])=>spawnSync(shell,['-NoLogo','-NoProfile','-NonInteractive','-File',path.join(root,'scripts/windows-worker.ps1'),'-Action',action,'-Profile',profile,'-NodePath',process.execPath,...args],{cwd:root,input,encoding:'utf8',windowsHide:true,timeout:60000});
  try {
    assert.equal(fs.existsSync(runtime),false);
    let result=invoke('Configure',JSON.stringify({...config,EXTRA:'forbidden'}));assert.equal(result.status,1);assert.equal(fs.existsSync(protectedFile),false);
    result=invoke('Configure',JSON.stringify(config),['-DryRun']);assert.equal(result.status,0,result.stderr);assert.equal(fs.existsSync(protectedFile),false);
    result=invoke('Configure',JSON.stringify(config));assert.equal(result.status,0,result.stderr);
    const ciphertext=fs.readFileSync(protectedFile,'utf8');assert.match(ciphertext,/^[a-f0-9]+$/i);assert.equal(ciphertext.includes(config.TURSO_AUTH_TOKEN),false);
    result=invoke('Validate');assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).valid,true);
    result=invoke('Plan');assert.equal(result.status,0,result.stderr);const plan=JSON.parse(result.stdout);assert.equal(plan.configured,true);assert.equal(plan.installed,false);assert.equal(plan.wakeComputer,false);assert.equal(plan.runLevel,'Limited');assert.equal(plan.credentialsOnCommandLine,false);assert.equal(plan.node,process.execPath);
    console.log('PASS Windows DPAPI round-trip and dry-run (no task installed; synthetic values only)');
  } finally {
    // This test owns only its new UUID profile; never remove an operator profile.
    const expected=path.resolve(root,'.sites-runtime');
    assert.equal(path.dirname(runtime),expected);assert.match(path.basename(runtime),/^windows-worker-test-[a-f0-9-]+$/);
    if(fs.existsSync(runtime)) assert.equal(fs.lstatSync(runtime).isSymbolicLink(),false,'Refusing to remove a replaced test directory');
    fs.rmSync(runtime,{recursive:true,force:true});
  }
} else console.log('SKIP Windows DPAPI checks on this platform');
