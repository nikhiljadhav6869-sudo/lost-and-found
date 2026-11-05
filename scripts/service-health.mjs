import {appendFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

const appOrigin='https://lost-and-found-yzfl.onrender.com';
const repository='nikhiljadhav6869-sudo/lost-and-found';
const backupMaximumAge=36*60*60*1000;

export function backupIsCurrent(runs, now=Date.now()) {
  return runs.some(run=>run.head_branch==='main' && run.conclusion==='success' &&
    run.name==='Private backups and maintenance' && run.display_title!=='Backup notification drill' &&
    Number.isFinite(Date.parse(run.updated_at)) && Date.parse(run.updated_at)<=now &&
    now-Date.parse(run.updated_at)<=backupMaximumAge);
}

// Public endpoints only. Retry cold starts before reporting a persistent problem.
export async function checkPublicService(fetcher=fetch, pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))) {
  let app=false, worker=null;
  for(let attempt=0;attempt<3;attempt++) {
    try {
      const response=await fetcher(appOrigin+'/api/config',{redirect:'error',signal:AbortSignal.timeout(30000)});
      const config=response.ok?await response.json():null;
      app=!!config && typeof config.intelligence==='boolean' && typeof config.auth?.passwordReset==='boolean';
      worker=app?config.intelligence:null;
      if(app && worker) break;
    } catch {app=false;worker=null;}
    if(attempt<2) await pause(5000);
  }
  return {app,worker};
}

export async function checkBackup(token, fetcher=fetch, now=Date.now()) {
  if(!token) throw Error('Backup history access is unavailable.');
  const response=await fetcher('https://api.github.com/repos/'+repository+'/actions/workflows/operations.yml/runs?branch=main&status=success&per_page=30',{
    redirect:'error',signal:AbortSignal.timeout(20000),
    headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
  });
  if(!response.ok) throw Error('Backup history could not be checked.');
  const result=await response.json();
  if(!Array.isArray(result.workflow_runs)) throw Error('Backup history response was invalid.');
  return backupIsCurrent(result.workflow_runs,now);
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const [service,backup]=await Promise.all([checkPublicService(),checkBackup(process.env.GITHUB_TOKEN)]);
    const problems=[...(!service.app?['app-unavailable']:service.worker===false?['worker-offline']:[]),...(!backup?['backup-overdue']:[])];
    const result={event:'service_health',...service,backupCurrent:backup,problems};
    console.log(JSON.stringify(result));
    if(process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,'attention='+(problems.length>0)+'\nproblems='+problems.join(',')+'\n');
  } catch {
    console.error('Service health could not be checked.');process.exitCode=1;
  }
}
