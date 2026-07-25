# ios-video-app

聚合视频 App，基于 Expo / React Native / TypeScript。

## 当前策略

- 后端优先：App 默认请求 `EXPO_PUBLIC_VIDEO_API_BASE_URL`。
- 本地 crawler 只做 fallback：配置后端后默认不启用，除非显式设置 `EXPO_PUBLIC_ENABLE_LOCAL_CRAWLER=true`。
- 始终不要打开网页：不走 WebView，不跳外部浏览器。
- `playPageUrl` 只作为 `/api/resolve` 输入；解析出 `mp4/m3u8/hls` 后才播放。
- 韩剧/电视剧偏好保留，但只放在 recommendation policy。
- App 不展示内部资源站名；后端和前端统一使用公开来源标签。

## 前端运行

```powershell
cd "E:\ios shipin\ios-video-app"
npm install
npm.cmd run android
```

常用检查：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd run check:all
```

## App 配置

`.env` 示例：

```env
EXPO_PUBLIC_VIDEO_API_BASE_URL=https://shipin.laig.top
EXPO_PUBLIC_VIDEO_API_FALLBACK_BASE_URL=
EXPO_PUBLIC_VIDEO_API_TOKEN=
EXPO_PUBLIC_ENABLE_LOCAL_CRAWLER=false
```

`EXPO_PUBLIC_VIDEO_API_FALLBACK_BASE_URL` 是 API 备用地址，只在主地址网络失败、超时或 502/503/504 时尝试。它仍然必须是后端 API 地址，不是网页播放入口。Android 设备如果访问 Cloudflare HTTPS 失败，可以临时配置一个直连后端的 HTTPS 域名，例如 DNS-only 的 `https://api-direct.example.com`。不建议长期使用 `http://服务器IP:3000`，因为 Android 明文 HTTP 可能被系统策略拦截。

## 后端运行

服务器目录是 `C:\video-backend`。首次部署或更新代码后：

只有实际修改后端相关代码时，回复用户才需要附后端服务器全量命令行命令。命令必须能在服务器 PowerShell 里直接修改或覆盖 `C:\video-backend` 对应文件，并包含必要的构建、数据库更新、任务重启和健康检查。纯前端/App 改动不提供后端命令，只说明“不需要后端命令”。

```powershell
cd C:\video-backend
npm run prisma:push
npm run build
```

注册长期运行任务。下面命令会开机启动后端，并每 6 小时自动抓取一次：

```powershell
cd C:\video-backend
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install-scheduled-tasks.ps1 -CrawlIntervalHours 6
```

如果后端不在 `C:\video-backend`，进入真实后端根目录执行同一条命令，或加 `-BackendDir 真实路径`。

脚本归档：

- `start.ps1`：手动启动入口。
- `scripts\windows\start-backend-forever.ps1`：守护 `npm start`，退出后自动重启。
- `scripts\windows\run-crawl-once.ps1`：执行一次抓取，带锁防止重复跑。
- `scripts\windows\install-scheduled-tasks.ps1`：注册 `VideoBackend-Api` 和 `VideoBackend-Crawl`。

临时前台启动和手动抓取：

```powershell
cd C:\video-backend
npm start
npm run crawl
```

Caddy 反代在 `C:\caddy`：

```powershell
cd C:\caddy
.\caddy.exe fmt --overwrite C:\caddy\Caddyfile
.\caddy.exe validate --config C:\caddy\Caddyfile
.\caddy.exe run --config C:\caddy\Caddyfile
```

你的 `caddy.exe` 不支持 `service` 子命令时，用计划任务长期运行：

```powershell
cd C:\caddy
$action = New-ScheduledTaskAction -Execute "C:\caddy\caddy.exe" -Argument "run --config C:\caddy\Caddyfile" -WorkingDirectory "C:\caddy"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName "Caddy-ReverseProxy" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force
Start-ScheduledTask -TaskName "Caddy-ReverseProxy"
```

查看数量：

```powershell
(Invoke-RestMethod "http://127.0.0.1:3000/api/videos?page=1&pageSize=200").items.Count
npm run inspect:videos
```

App 首页加载策略：

- 首次进入先展示持久缓存，再请求后端第一页；App 默认 `pageSize=48`。
- 后端返回 `nextCursor/hasMore`，App 优先用游标提前预取下一页，游标缺失时兼容旧 `page` 翻页。
- 首页维护本地视频蓄水池：用户滚动时优先消费已预取内容，剩余不足时后台补水，并提前预取下一屏封面。
- 后端列表默认按 `国产剧 -> 韩剧 -> 电视剧 -> 其他` 的产品策略排序，搜索永远先走 `/api/search` 并优先精确命中。
- 后端列表接口只返回卡片所需的轻量字段；完整线路、剧集和播放页只在详情接口返回。
- 后端列表、搜索、详情有短 TTL 内存缓存；后端启动和抓取完成后会预热常用首页、分类页和下一页缓存。
- `/api/resolve` 成功后会在后端缓存解析结果，再次播放同一集应明显更快。
- 后端有几万条数据时，App 不会一次性全量拉取，避免启动卡顿。
- Android 出现 `Network request failed` 时，说明 App 没拿到 HTTP 响应。先确认 Windows 侧 `Invoke-WebRequest https://shipin.laig.top/api/health -UseBasicParsing` 是否成功，再检查设备网络或配置 `EXPO_PUBLIC_VIDEO_API_FALLBACK_BASE_URL`。

更完整的后端说明见 `BACKEND_SETUP_WIN2022.md`。

## 重要文档

- `BACKEND_SETUP_WIN2022.md`: 后端部署、启动、抓取、接口和排错。
- `docs/ARCHITECTURE.md`: 目录分层和工程红线。
- `QA_CHECKLIST.md`: 最小验收清单。
