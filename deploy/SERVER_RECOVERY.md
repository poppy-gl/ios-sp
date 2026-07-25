# Windows Server 2022 恢复清单

本目录用于在服务器丢失后恢复视频后端与 Caddy。完整运维说明见项目根目录的
`BACKEND_SETUP_WIN2022.md`。

## 压缩包目录

将迁移包解压后：

- `video-backend` 放到 `C:\video-backend`
- `caddy\Caddyfile` 放到 `C:\caddy\Caddyfile`
- `C:\caddy\caddy.exe` 需要单独下载或从可信备份恢复

迁移包不会包含：

- `.env`、token、密码、证书或其他凭据
- `node_modules`
- SQLite 数据库和运行日志
- Caddy 自动签发的 TLS 私钥及证书

## 首次恢复

在管理员 PowerShell 中为新服务器生成配置：

```powershell
Copy-Item -LiteralPath C:\video-backend\.env.example -Destination C:\video-backend\.env

$apiToken = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
$adminToken = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
$envPath = "C:\video-backend\.env"
$envText = [System.IO.File]::ReadAllText($envPath)
$envText = $envText.Replace("replace-with-a-new-random-token", $apiToken)
$envText = $envText.Replace("replace-with-a-new-random-admin-token", $adminToken)
[System.IO.File]::WriteAllText($envPath, $envText, [System.Text.UTF8Encoding]::new($false))

cd C:\video-backend
npm install
npm run prisma:push
npm run build
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install-scheduled-tasks.ps1 -CrawlIntervalHours 336
Start-ScheduledTask -TaskName "VideoBackend-Api"
```

格式化、校验并注册 Caddy：

```powershell
cd C:\caddy
.\caddy.exe fmt --overwrite C:\caddy\Caddyfile
.\caddy.exe validate --config C:\caddy\Caddyfile

$action = New-ScheduledTaskAction -Execute "C:\caddy\caddy.exe" -Argument "run --config C:\caddy\Caddyfile" -WorkingDirectory "C:\caddy"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName "Caddy-ReverseProxy" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force
Start-ScheduledTask -TaskName "Caddy-ReverseProxy"
```

## 验证

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
Invoke-RestMethod https://shipin.laig.top/api/health
Get-ScheduledTask -TaskName "VideoBackend-*"
Get-ScheduledTask -TaskName "Caddy-ReverseProxy"
Get-NetTCPConnection -LocalPort 80 -State Listen
Get-NetTCPConnection -LocalPort 443 -State Listen
```

确认域名 DNS 已指向新服务器，并在防火墙与云平台安全组中放行 TCP 80 和 443。
