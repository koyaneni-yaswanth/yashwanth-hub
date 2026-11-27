$ErrorActionPreference = 'Stop'
$AgentRoot = Split-Path -Parent $PSScriptRoot
$Action = New-ScheduledTaskAction -Execute "pythonw.exe" -Argument "-m jarvis_local.app" -WorkingDirectory $AgentRoot
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "JarvisLocalRuntime" -Action $Action -Trigger $Trigger -Settings $Settings -Force | Out-Null
Write-Host "Registered Windows startup Scheduled Task 'JarvisLocalRuntime' (auto-restart up to 3x)." -ForegroundColor Green
