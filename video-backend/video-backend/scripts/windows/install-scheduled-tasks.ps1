param(
  [string]$BackendDir = "",
  [int]$CrawlIntervalHours = 336,
  [int]$CrawlStartDelayMinutes = 30,
  [switch]$EnableScheduledCrawl = $true,
  [switch]$DisableScheduledCrawl,
  [switch]$UseCurrentUser
)

$ErrorActionPreference = "Stop"

if (-not $BackendDir) {
  $BackendDir = Resolve-Path (Join-Path $PSScriptRoot "..\..") | Select-Object -ExpandProperty Path
}

$apiTaskName = "VideoBackend-Api"
$crawlTaskName = "VideoBackend-Crawl"
$powerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$serverScript = Join-Path $BackendDir "scripts\windows\start-backend-forever.ps1"
$crawlScript = Join-Path $BackendDir "scripts\windows\run-crawl-once.ps1"
$scheduledCrawlEnabled = $EnableScheduledCrawl -and -not $DisableScheduledCrawl

if (-not (Test-Path -LiteralPath $serverScript)) {
  throw "Missing script: $serverScript"
}

if ($scheduledCrawlEnabled -and -not (Test-Path -LiteralPath $crawlScript)) {
  throw "Missing script: $crawlScript"
}

if ($scheduledCrawlEnabled -and $CrawlIntervalHours -lt 1) {
  throw "CrawlIntervalHours must be at least 1."
}

if ($scheduledCrawlEnabled -and $CrawlStartDelayMinutes -lt 1) {
  throw "CrawlStartDelayMinutes must be at least 1."
}

$principal = if ($UseCurrentUser) {
  $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  New-ScheduledTaskPrincipal -UserId $currentUser -LogonType S4U -RunLevel Highest
} else {
  New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
}

$apiAction = New-ScheduledTaskAction `
  -Execute $powerShell `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$serverScript`" -BackendDir `"$BackendDir`""
$apiTrigger = New-ScheduledTaskTrigger -AtStartup
$apiSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable `
  -WakeToRun

Register-ScheduledTask `
  -Action $apiAction `
  -Description "Keeps the video backend API running." `
  -Force `
  -Principal $principal `
  -Settings $apiSettings `
  -TaskName $apiTaskName `
  -Trigger $apiTrigger | Out-Null

if ($scheduledCrawlEnabled) {
  $crawlAction = New-ScheduledTaskAction `
    -Execute $powerShell `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$crawlScript`" -BackendDir `"$BackendDir`""
  $crawlTrigger = New-ScheduledTaskTrigger `
    -At (Get-Date).AddMinutes($CrawlStartDelayMinutes) `
    -Once `
    -RepetitionDuration ([TimeSpan]::FromDays(3650)) `
    -RepetitionInterval (New-TimeSpan -Hours $CrawlIntervalHours)
  $crawlSettings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable `
    -WakeToRun

  Register-ScheduledTask `
    -Action $crawlAction `
    -Description "Runs video crawl on a fixed interval." `
    -Force `
    -Principal $principal `
    -Settings $crawlSettings `
    -TaskName $crawlTaskName `
    -Trigger $crawlTrigger | Out-Null
} else {
  $existingCrawlTask = Get-ScheduledTask -TaskName $crawlTaskName -ErrorAction SilentlyContinue

  if ($existingCrawlTask) {
    Disable-ScheduledTask -TaskName $crawlTaskName | Out-Null
  }
}

Start-ScheduledTask -TaskName $apiTaskName

Write-Host "Registered scheduled tasks:"
Write-Host "  $apiTaskName    - starts at boot and restarts backend if it exits"
if ($scheduledCrawlEnabled) {
  Write-Host "  $crawlTaskName  - starts in $CrawlStartDelayMinutes minute(s), then runs every $CrawlIntervalHours hour(s)"
} else {
  Write-Host "  $crawlTaskName  - disabled; run scripts\windows\run-crawl-once.ps1 manually for one-time seed crawls"
}
Write-Host ""
Write-Host "Logs:"
Write-Host "  $BackendDir\logs\server.log"
Write-Host "  $BackendDir\logs\crawl.log"
