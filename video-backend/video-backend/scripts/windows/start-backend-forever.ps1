param(
  [string]$BackendDir = "",
  [int]$RestartDelaySeconds = 5
)

$ErrorActionPreference = "Stop"

if (-not $BackendDir) {
  $BackendDir = Resolve-Path (Join-Path $PSScriptRoot "..\..") | Select-Object -ExpandProperty Path
}

Set-Location -LiteralPath $BackendDir
New-Item -ItemType Directory -Force -Path (Join-Path $BackendDir "logs") | Out-Null

if (-not $env:NODE_ENV) {
  $env:NODE_ENV = "production"
}

if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = "file:C:/video-backend/data/app.db"
}

if (-not $env:RESOLVE_SUCCESS_CACHE_TTL_MS) {
  $env:RESOLVE_SUCCESS_CACHE_TTL_MS = "86400000"
}

if (-not $env:RESOLVE_FAILURE_CACHE_TTL_MS) {
  $env:RESOLVE_FAILURE_CACHE_TTL_MS = "1800000"
}

if (-not $env:SEARCH_ON_DEMAND_CRAWL_ENABLED) {
  $env:SEARCH_ON_DEMAND_CRAWL_ENABLED = "true"
}

if (-not $env:SEARCH_CRAWL_ATTEMPT_CACHE_TTL_MS) {
  $env:SEARCH_CRAWL_ATTEMPT_CACHE_TTL_MS = "1800000"
}

if (-not $env:SEARCH_ON_DEMAND_LOCAL_HIT_TARGET) {
  $env:SEARCH_ON_DEMAND_LOCAL_HIT_TARGET = "1"
}

if (-not $env:SEARCH_ON_DEMAND_MAX_VIDEOS) {
  $env:SEARCH_ON_DEMAND_MAX_VIDEOS = "1"
}

if (-not $env:CRAWL_SEARCH_DETAIL_SCAN) {
  $env:CRAWL_SEARCH_DETAIL_SCAN = "1"
}

if (-not $env:CRAWL_SEARCH_MAX_VIDEOS) {
  $env:CRAWL_SEARCH_MAX_VIDEOS = "1"
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  $npm = Get-Command npm -ErrorAction SilentlyContinue
}

if (-not $npm) {
  throw "npm was not found in PATH. Install Node.js system-wide or run this task under the user that installed Node.js."
}

$logPath = Join-Path $BackendDir "logs\server.log"

while ($true) {
  $startedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $logPath -Value "[$startedAt] starting video backend"

  & $npm.Source start *>> $logPath
  $exitCode = $LASTEXITCODE

  $stoppedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $logPath -Value "[$stoppedAt] backend exited with code $exitCode; restarting in $RestartDelaySeconds seconds"
  Start-Sleep -Seconds $RestartDelaySeconds
}
