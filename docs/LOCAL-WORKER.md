# AI worker on Windows

This option runs the existing CPU models on a trusted Windows computer without purchasing a worker server. The public web app remains hosted on Render. AI jobs run only while this computer is awake and the configured Windows user is signed in. Signing out, shutdown, sleep, or the default Task Scheduler battery conditions can pause AI processing. Ordinary report matching remains available. This is not an always-on hosting service.

## Prepare and configure

Use PowerShell 7 on Windows (or Windows PowerShell 5.1) with Node.js 24 or later. Install the root dependencies and the separate `ai-worker` dependencies. The existing model benchmark downloads and validates the pinned models. Keep this checkout and the selected Node and PowerShell executables available at their absolute paths. The commands below use `pwsh`; substitute `powershell` if using Windows PowerShell 5.1.

`scripts/windows-worker.ps1 -Action Configure` accepts one JSON object on **standard input**, containing exactly these string keys:

```text
STORAGE_MODE (remote)
TURSO_DATABASE_URL
TURSO_AUTH_TOKEN
SUPABASE_URL
SUPABASE_SECRET_KEY
SUPABASE_STORAGE_BUCKET
```

Supply the production app's remote database and private photo settings using a trusted secret-transfer mechanism. Do not put values in command arguments, shell history, tracked files, or a plaintext file in the OneDrive checkout. The script validates the allowlist and remote URL formats without contacting the database. `-Action Configure -DryRun` validates without saving. Unknown settings and local storage are rejected.

The complete JSON is encrypted with Windows **current-user DPAPI**, then stored in `.sites-runtime/windows-worker/credentials.dpapi`. The directory is restricted to the current Windows user and is ignored by Git. Other accounts and machines cannot normally decrypt this file, even if OneDrive copies it. Windows administrators and software running as the same user may access running-process secrets; use a trusted machine. Do not treat this blob as a portable disaster-recovery copy of provider credentials.

## Install, start and inspect

From the repository directory:

```powershell
pwsh -NoProfile -File .\scripts\windows-worker.ps1 -Action Validate
pwsh -NoProfile -File .\scripts\windows-worker.ps1 -Action Plan
pwsh -NoProfile -File .\scripts\windows-worker.ps1 -Action Install
pwsh -NoProfile -File .\scripts\windows-worker.ps1 -Action Start
pwsh -NoProfile -File .\scripts\windows-worker.ps1 -Action Status
```

Install registers a uniquely named task for the **current user at logon**, using the lowest privilege, the resolved absolute Node path, and a hidden window. It does not save a Windows password, request administrator access, prevent sleep, enable wake timers, or change firewall settings. It refuses to replace an existing task. The task has no execution time limit; default Windows battery restrictions are retained.

To also process jobs while the laptop is on battery, install with `-Action Install -AllowBattery`. This uses battery power but still permits normal sleep and shutdown. The activated installation on this computer allows battery operation; Windows had otherwise queued it without starting.

The launcher uses a Windows job object so stopping the task terminates the supervisor and model children. The supervisor waits 15 seconds between normal worker batches. Unexpected exits retry with exponential delay from 15 seconds to 15 minutes, stopping after eight consecutive short-lived failures. Task Scheduler can retry a failed launcher up to three times at five-minute intervals. A worker surviving five minutes resets the consecutive-failure count. A Windows named mutex, restricted to the current user and scoped to the project/profile, prevents duplicate launchers across login sessions. Windows releases ownership when the launcher exits or is terminated; stale PID files and unrelated reused process IDs cannot block recovery. Use the PowerShell launcher to run the internal supervisor.

The local `worker.log` records only fixed event names, counts, exit codes, and times. Raw model/provider errors, report content, photos, and credentials are discarded. Logs rotate at approximately 256 KB with one previous file. To verify activation, check the app's service status for a recent worker heartbeat and a successfully processed job. A start request by itself does not prove the worker connected. Availability can remain visible for up to 15 minutes after the last heartbeat.

## Stop or remove

```powershell
pwsh -NoProfile -File .\scripts\windows-worker.ps1 -Action Stop
pwsh -NoProfile -File .\scripts\windows-worker.ps1 -Action Remove
# Optional: also remove this worker's encrypted local credentials.
pwsh -NoProfile -File .\scripts\windows-worker.ps1 -Action Remove -ForgetCredentials
```

Remove affects only the task derived from this checkout and profile. It leaves provider credentials unchanged and retains the encrypted local configuration unless `-ForgetCredentials` is supplied. Unfinished database leases expire and are safely retried by a later worker. To update the checkout or move Node, stop the worker first; remove and reinstall the task if either absolute path changes.

`node tests/windows-worker.mjs` checks strict remote configuration, sanitized log events, bounded retries, a synthetic Windows DPAPI round-trip, active-mutex exclusion, and recovery after forcibly stopping a synthetic mutex owner. The Windows checks default to Windows PowerShell 5.1; to use PowerShell 7, set `WORKER_TEST_POWERSHELL` to its absolute executable path. The test creates no scheduled task and contacts no production service. `node tests/windows-worker-mutex.mjs` runs just the mutex checks. Operational activation additionally requires a real heartbeat and queue-processing check.
