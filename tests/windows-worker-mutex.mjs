import assert from 'node:assert/strict';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const literal=value=>"'"+value.replaceAll("'","''")+"'";
export async function testWindowsMutex(shell,root) {
  if(process.platform!=='win32')return;
  const profile='windows-worker-mutex-test-'+randomUUID();
  const helper=literal(path.join(root,'scripts/windows-worker-mutex.cs'));
  const open=`[LostFoundWorkerMutex]::Open(${literal(root)},${literal(profile)})`;
  const processes=[];
  function launch(script) {
    const child=spawn(shell,['-NoLogo','-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop'; Add-Type -Path ${helper}; ${script}`],{cwd:root,windowsHide:true,stdio:['pipe','pipe','pipe']});
    processes.push(child);
    let buffer='',stderr='',waiting,ended=false;const lines=[];
    child.stdout.on('data',chunk=>{buffer+=chunk;let index;while((index=buffer.indexOf('\n'))>=0){lines.push(buffer.slice(0,index).trim());buffer=buffer.slice(index+1);waiting?.();}});
    child.stderr.on('data',chunk=>{stderr+=chunk;});
    const closed=new Promise(resolve=>{
      child.once('error',error=>{stderr+=error.message;ended=true;waiting?.();resolve(-1);});
      child.once('close',code=>{ended=true;waiting?.();resolve(code);});
    });
    const line=()=>new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{waiting=null;reject(new Error('Synthetic Windows mutex test timed out. '+stderr));},60000);
      waiting=()=>{
        if(lines.length){clearTimeout(timeout);waiting=null;resolve(lines.shift());}
        else if(ended){clearTimeout(timeout);waiting=null;reject(new Error('Synthetic Windows mutex process exited early. '+stderr));}
      };waiting();
    });
    return {child,closed,line,stderr:()=>stderr};
  }
  try {
    const owner=launch(`$lease=${open}; try { [Console]::WriteLine('owner:'+$lease.Acquire(0)); [Console]::Out.Flush(); $null=[Console]::ReadLine(); } finally { $lease.Dispose(); }`);
    assert.equal(await owner.line(),'owner:True');
    const aliasOpen=`[LostFoundWorkerMutex]::Open(${literal(root.toUpperCase())},${literal(profile.toUpperCase().replace('WINDOWS-WORKER','windows-worker'))})`;
    const waiter=launch(`$other=[LostFoundWorkerMutex]::Open(${literal(root)},${literal(profile+'-other')}); try { [Console]::WriteLine('isolated:'+$other.Acquire(0)); } finally { $other.Dispose(); }; $lease=${aliasOpen}; try { [Console]::WriteLine('blocked:'+(!$lease.Acquire(0))); [Console]::Out.Flush(); $null=[Console]::ReadLine(); $acquired=$lease.Acquire(2000); [Console]::WriteLine('recovered:'+$acquired+':'+$lease.WasAbandoned); } finally { $lease.Dispose(); }`);
    assert.equal(await waiter.line(),'isolated:True');
    assert.equal(await waiter.line(),'blocked:True','An active launcher must exclude a second launcher, including case aliases.');
    // Terminate only the synthetic process started by this test. The waiter keeps
    // a handle open so Windows reports actual abandonment rather than recreation.
    owner.child.kill('SIGKILL');await owner.closed;
    waiter.child.stdin.end('retry\n');
    assert.equal(await waiter.line(),'recovered:True:True','A forced owner exit must allow immediate recovery.');
    assert.equal(await waiter.closed,0,waiter.stderr());
    console.log('PASS Windows mutex exclusion, profile isolation and recovery after forced owner exit');
  } finally {
    for(const child of processes)if(child.exitCode===null && child.signalCode===null)child.kill('SIGKILL');
  }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.platform==='win32')await testWindowsMutex(process.env.WORKER_TEST_POWERSHELL || path.join(process.env.SystemRoot || 'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),process.cwd());
  else console.log('SKIP Windows mutex checks on this platform');
}
