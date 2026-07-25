Set-Location -LiteralPath $PSScriptRoot
$env:NODE_ENV="production"
New-Item -ItemType Directory -Force .\logs | Out-Null
.\scripts\windows\start-backend-forever.ps1
