param(
    [ValidateSet('Configure', 'Validate', 'Install', 'Start', 'Stop', 'Status', 'Remove', 'Run', 'Plan')]
    [string]$Action = 'Status',
    [ValidatePattern('^windows-worker(-[a-zA-Z0-9_-]+)?$')]
    [string]$Profile = 'windows-worker',
    [string]$NodePath,
    [switch]$DryRun,
    [switch]$ForgetCredentials,
    [switch]$AllowBattery
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtime = Join-Path (Join-Path $root '.sites-runtime') $Profile
$configFile = Join-Path $runtime 'credentials.dpapi'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$hash = [Security.Cryptography.SHA256]::Create()
$identity = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($root + $Profile))).Replace('-', '').Substring(0, 12)
$taskName = 'LostFound-AI-Worker-' + $identity
$node = if ($NodePath) { [IO.Path]::GetFullPath($NodePath) } else { (Get-Command node.exe -ErrorAction Stop).Source }
if (!(Test-Path -LiteralPath $node -PathType Leaf)) { throw 'Node.js is unavailable.' }
$supervisor = Join-Path $PSScriptRoot 'worker-supervisor.mjs'
$stage = 'initialization'

function Read-ProtectedConfig {
    if (!(Test-Path -LiteralPath $configFile)) { throw 'Configure the worker before installing or starting it.' }
    $secure = ConvertTo-SecureString ([IO.File]::ReadAllText($configFile))
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer); $secure.Dispose() }
}
function Validate-Config([string]$json) {
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $node
    $start.Arguments = '"' + $supervisor + '" --validate'
    $start.WorkingDirectory = $root
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($start)
    $process.StandardInput.Write($json); $process.StandardInput.Close()
    $output = $process.StandardOutput.ReadToEnd()
    $null = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0 -or $output.Trim() -ne '{"valid":true}') { throw 'Invalid remote worker configuration. No credentials were saved.' }
    $process.Dispose()
}
function Find-Task { return Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue }
function Protect-Directory {
    $null = [IO.Directory]::CreateDirectory($runtime)
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $userIdentity = New-Object Security.Principal.SecurityIdentifier($sid)
    $acl.SetOwner($userIdentity)
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($userIdentity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $runtime -AclObject $acl
}

try {
    if ($Action -eq 'Configure') {
        $json = [Console]::In.ReadToEnd()
        $stage = 'configuration validation'
        Validate-Config $json
        if ($DryRun) { '{"valid":true,"saved":false}'; exit 0 }
        $stage = 'private directory permissions'
        Protect-Directory
        $stage = 'Windows encryption'
        $secure = ConvertTo-SecureString $json -AsPlainText -Force
        try { $encrypted = ConvertFrom-SecureString $secure; $stage = 'encrypted file save'; [IO.File]::WriteAllText($configFile, $encrypted) }
        finally { $secure.Dispose(); $json = $null; $encrypted = $null }
        '{"configured":true,"protection":"Windows current-user DPAPI"}'
    }
    elseif ($Action -eq 'Validate') {
        Validate-Config (Read-ProtectedConfig)
        '{"valid":true,"protection":"Windows current-user DPAPI"}'
    }
    elseif ($Action -eq 'Plan' -or $DryRun) {
        [ordered]@{ taskName=$taskName; node=$node; project=$root; profile=$Profile; configured=(Test-Path -LiteralPath $configFile); trigger='Current user logon'; runLevel='Limited'; window='Hidden'; wakeComputer=$false; executionTimeLimit='Unlimited'; credentialsOnCommandLine=$false; installed=$false } | ConvertTo-Json -Compress
    }
    elseif ($Action -eq 'Install') {
        Validate-Config (Read-ProtectedConfig)
        $version = (& $node --version).TrimStart('v').Split('.')[0]
        if ([int]$version -lt 24) { throw 'Node.js 24 or later is required.' }
        if (Find-Task) { throw 'This worker task already exists. Use Start or Remove before installing again.' }
        $arguments = '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -File "' + $PSCommandPath + '" -Action Run -Profile "' + $Profile + '" -NodePath "' + $node + '"'
        $shellExecutable = [Diagnostics.Process]::GetCurrentProcess().MainModule.FileName
        $actionSpec = New-ScheduledTaskAction -Execute $shellExecutable -Argument $arguments -WorkingDirectory $root
        $trigger = New-ScheduledTaskTrigger -AtLogOn -User $sid
        $principal = New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited
        $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) -StartWhenAvailable
        if ($AllowBattery) {
            $settings.DisallowStartIfOnBatteries = $false
            $settings.StopIfGoingOnBatteries = $false
        }
        $null = Register-ScheduledTask -TaskName $taskName -Action $actionSpec -Trigger $trigger -Principal $principal -Settings $settings -Description 'Lost & Found private AI processing while this user is signed in. No wake timers or administrator privileges.'
        [ordered]@{installed=$true;taskName=$taskName} | ConvertTo-Json -Compress
    }
    elseif ($Action -eq 'Start') {
        Validate-Config (Read-ProtectedConfig)
        if (!(Find-Task)) { throw 'Install the worker task first.' }
        Start-ScheduledTask -TaskName $taskName
        '{"startRequested":true}'
    }
    elseif ($Action -eq 'Stop') {
        if (Find-Task) { Stop-ScheduledTask -TaskName $taskName }
        '{"stopRequested":true}'
    }
    elseif ($Action -eq 'Remove') {
        if (Find-Task) { Stop-ScheduledTask -TaskName $taskName; Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }
        if ($ForgetCredentials -and (Test-Path -LiteralPath $configFile)) { Remove-Item -LiteralPath $configFile }
        [ordered]@{removed=$true;credentialsRetained=(Test-Path -LiteralPath $configFile)} | ConvertTo-Json -Compress
    }
    elseif ($Action -eq 'Status') {
        $task = Find-Task
        $lastResult = $null
        if ($task) { $lastResult = (Get-ScheduledTaskInfo -TaskName $taskName).LastTaskResult }
        [ordered]@{taskName=$taskName;configured=(Test-Path -LiteralPath $configFile);installed=[bool]$task;state=$(if($task){[string]$task.State}else{'NotInstalled'});lastTaskResult=$lastResult;log=(Join-Path $runtime 'worker.log')} | ConvertTo-Json -Compress
    }
    elseif ($Action -eq 'Run') {
        $stage = 'worker ownership'
        Add-Type -Path (Join-Path $PSScriptRoot 'windows-worker-mutex.cs')
        $workerMutex = [LostFoundWorkerMutex]::Open($root, $Profile)
        try {
        if (!$workerMutex.Acquire(0)) { exit 0 }
        $json = Read-ProtectedConfig
        Validate-Config $json
        # A job object owns this launcher and every descendant, including native model processes.
        # Windows closes the last handle when Task Scheduler stops the launcher, killing children.
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LostFoundWorkerJob {
    static IntPtr handle;
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job, int kind, IntPtr data, uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    [StructLayout(LayoutKind.Sequential)] struct Basic { public long processTime,jobTime;public uint flags;public UIntPtr minWorking,maxWorking;public uint active;public UIntPtr affinity;public uint priority,scheduling; }
    [StructLayout(LayoutKind.Sequential)] struct Io { public ulong readOperations,writeOperations,otherOperations,readBytes,writeBytes,otherBytes; }
    [StructLayout(LayoutKind.Sequential)] struct Extended { public Basic basic;public Io io;public UIntPtr processMemory,jobMemory,peakProcess,peakJob; }
    public static void Attach() {
        handle=CreateJobObject(IntPtr.Zero,null); if(handle==IntPtr.Zero)throw new Exception("Cannot create worker process group.");
        var limits=new Extended(); limits.basic.flags=0x2000;
        int size=Marshal.SizeOf(typeof(Extended));IntPtr buffer=Marshal.AllocHGlobal(size);
        try {Marshal.StructureToPtr(limits,buffer,false);if(!SetInformationJobObject(handle,9,buffer,(uint)size)||!AssignProcessToJobObject(handle,GetCurrentProcess()))throw new Exception("Cannot isolate worker process group.");}
        finally {Marshal.FreeHGlobal(buffer);}
    }
}
'@
        [LostFoundWorkerJob]::Attach()
        $start = New-Object Diagnostics.ProcessStartInfo
        $start.FileName = $node
        $start.Arguments = '"' + $supervisor + '" ' + $Profile
        $start.WorkingDirectory = $root
        $start.UseShellExecute = $false
        $start.CreateNoWindow = $true
        $start.RedirectStandardInput = $true
        $process = [Diagnostics.Process]::Start($start)
        $process.StandardInput.Write($json); $process.StandardInput.Close(); $json=$null
        $process.WaitForExit()
        exit $process.ExitCode
        }
        finally { $workerMutex.Dispose() }
    }
}
catch {
    # Never output credential contents, provider responses, or raw exception details.
    [Console]::Error.WriteLine('Worker setup failed during ' + $Action + ' (' + $stage + '). Check Node.js 24, protected configuration, and Windows task permissions.')
    exit 1
}
