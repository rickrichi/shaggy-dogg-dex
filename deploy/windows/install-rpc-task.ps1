# Registers a per-user logon task that runs the Shaggy-Dogg RPC gateway (hidden, auto-restart).
# Run once after `npm --prefix server run rpc:build`. Remove with: Unregister-ScheduledTask ShaggyDoggRpc -Confirm:$false
$ErrorActionPreference = 'Stop'
$server = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path 'server'
$node = (Get-Command node).Source
if (-not (Test-Path (Join-Path $server 'dist-rpc\main.js'))) { throw 'Run: npm --prefix server run rpc:build' }
$action  = New-ScheduledTaskAction -Execute $node -Argument 'dist-rpc/main.js' -WorkingDirectory $server
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$set = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'ShaggyDoggRpc' -Action $action -Trigger $trigger -Settings $set -Description 'Shaggy-Dogg Base RPC gateway (127.0.0.1:8790)' -Force | Out-Null
Start-ScheduledTask -TaskName 'ShaggyDoggRpc'
'Registered and started ShaggyDoggRpc.'
