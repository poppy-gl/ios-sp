# Windows Server 2022 恢复清单

本目录用于在服务器丢失后恢复视频后端与 Caddy。完整运维说明见项目根目录的
`BACKEND_SETUP_WIN2022.md`。

## 服务器环境

必装：

- Windows Server 2022 x64，并安装最新系统更新。
- Node.js 22 LTS，最低版本 `22.12.0`；项目使用的 Prisma 7.8 支持
  `^20.19`、`^22.12` 或 `>=24.0`，新服务器推荐统一使用 Node.js 22 LTS。
- Node.js 自带的 npm。
- Caddy Windows x64，放置为 `C:\caddy\caddy.exe`。
- PowerShell 5.1 或更新版本，用于安装和维护计划任务。

系统和网络：

- 域名 `shipin.laig.top` 的 DNS 记录指向新服务器公网 IP。
- Windows 防火墙和云平台安全组放行入站 TCP 80、443。
- 后端只监听 `127.0.0.1:3000`；不需要把 3000 端口暴露到公网。
- 为计划任务使用的账户保留 `C:\video-backend` 和 `C:\caddy` 的读写权限。
- 校准系统时间并启用 Windows 时间同步，否则 HTTPS 证书签发可能失败。

不需要单独安装 SQLite 服务。项目通过 `better-sqlite3` 使用
`C:\video-backend\data\app.db`。如果 `npm install` 无法下载
`better-sqlite3` 的预编译文件，再补装 Python 3 和 Visual Studio 2022 Build
Tools 的“使用 C++ 的桌面开发”组件；正常情况下不需要。

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
