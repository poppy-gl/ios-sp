param(
  [string]$BackendDir = ""
)

$ErrorActionPreference = "Stop"

if (-not $BackendDir) {
  $BackendDir = Resolve-Path (Join-Path $PSScriptRoot "..\..") | Select-Object -ExpandProperty Path
}

Set-Location -LiteralPath $BackendDir
New-Item -ItemType Directory -Force -Path (Join-Path $BackendDir "data") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $BackendDir "logs") | Out-Null

if (-not $env:NODE_ENV) {
  $env:NODE_ENV = "production"
}

if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = "file:C:/video-backend/data/app.db"
}

if (-not $env:CRAWL_MAX_CATEGORY_PAGES) {
  $env:CRAWL_MAX_CATEGORY_PAGES = "9007199254740991"
}

if (-not $env:CRAWL_MAX_DETAIL_SCAN) {
  $env:CRAWL_MAX_DETAIL_SCAN = "9007199254740991"
}

if (-not $env:CRAWL_MAX_DETAIL_SCAN_PER_SEED) {
  $env:CRAWL_MAX_DETAIL_SCAN_PER_SEED = "9007199254740991"
}

if (-not $env:CRAWL_DETAIL_CONCURRENCY) {
  $env:CRAWL_DETAIL_CONCURRENCY = "1"
}

if (-not $env:CRAWL_REQUEST_DELAY_MS) {
  $env:CRAWL_REQUEST_DELAY_MS = "2500"
}

if (-not $env:CRAWL_REQUEST_JITTER_MS) {
  $env:CRAWL_REQUEST_JITTER_MS = "1500"
}

if (-not $env:CRAWL_BLOCK_BACKOFF_MS) {
  $env:CRAWL_BLOCK_BACKOFF_MS = "300000"
}

if (-not $env:CRAWL_MAX_VIDEOS) {
  $env:CRAWL_MAX_VIDEOS = "9007199254740991"
}

if (-not $env:CRAWL_SKIP_EXISTING_HOURS) {
  $env:CRAWL_SKIP_EXISTING_HOURS = "72"
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  $npm = Get-Command npm -ErrorAction SilentlyContinue
}

if (-not $npm) {
  throw "npm was not found in PATH. Install Node.js system-wide or run this task under the user that installed Node.js."
}

$logPath = Join-Path $BackendDir "logs\crawl.log"
$lockPath = Join-Path $BackendDir "data\crawl.lock"

if (Test-Path -LiteralPath $lockPath) {
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $logPath -Value "[$stamp] skip crawl because another crawl lock exists: $lockPath"
  exit 0
}

try {
  Set-Content -LiteralPath $lockPath -Value (Get-Date -Format "o")
  $startedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $logPath -Value "[$startedAt] starting video crawl"

  & $npm.Source run crawl *>> $logPath
  $exitCode = $LASTEXITCODE

  $finishedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $logPath -Value "[$finishedAt] crawl exited with code $exitCode"
  exit $exitCode
} finally {
  if (Test-Path -LiteralPath $lockPath) {
    Remove-Item -LiteralPath $lockPath -Force
  }
}
