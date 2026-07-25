# Windows Server 2022 后端说明

本文只保留后端运行、抓取、接口和排错的必要信息。

## 基本信息

- 服务器目录：`C:\video-backend`
- 仓库内后端副本：`ios-video-app/video-backend/video-backend`
- 对外域名：`https://shipin.laig.top`
- 本地监听：`127.0.0.1:3000`
- 数据库：SQLite，默认 `C:\video-backend\data\app.db`
- App 后端地址：`EXPO_PUBLIC_VIDEO_API_BASE_URL=https://shipin.laig.top`
- App API 备用地址：`EXPO_PUBLIC_VIDEO_API_FALLBACK_BASE_URL`，可选，只用于主 API 网络失败时兜底
- API 对外来源名：统一使用公开标签，不向 App 展示内部资源站名

后端职责：

- 抓取授权来源
- 聚合、去重、分类、缓存视频
- 提供 `/api/videos`、`/api/search`、`/api/videos/:id`
- 通过 `/api/resolve` 把 `playPageUrl` 懒解析成 direct media URL

App 不打开网页。`playPageUrl`、`webViewUrl`、iframe URL 只能作为解析输入；解析不出 `mp4/m3u8/hls` 等直链就返回失败。

## 后端变更交付约定

只有实际修改了后端、爬虫、数据库 schema、Caddy 或 Windows Server 2022 部署脚本时，回复用户才必须附上后端服务器全量命令行命令。命令必须能在服务器 PowerShell 里直接修改或覆盖 `C:\video-backend` 对应文件，并包含必要的构建、数据库更新、任务重启和健康检查。

纯前端/App 改动不提供后端命令，只明确说明“不需要后端命令”。服务器命令不能引用本机 `E:\ios shipin` 路径。复制文件时逐个写清源路径和目标路径，不使用递归复制、递归删除或通配符删除。

## 首次部署

```powershell
cd C:\video-backend
npm install
npm run prisma:push
npm run build
```

`npm run prisma:push` 会根据 `prisma/schema.prisma` 创建或更新 SQLite 表结构。
当前 schema 包含 `ResolvedEpisode` 解析缓存表，更新后端代码后需要执行一次 `npm run prisma:push`。

在服务器 PowerShell 里直接覆盖 `prisma\schema.prisma` 时，必须使用 UTF-8 无 BOM。不要用 `Set-Content -Encoding UTF8` 写该文件，否则 Prisma 7 可能把文件开头的 BOM 当成非法字符并在第 1 行报 `P1012`。

```powershell
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText("C:\video-backend\prisma\schema.prisma", $schema, $utf8NoBom)
```

## 脚本归档

后端脚本都放在 `C:\video-backend\scripts\windows`。仓库内对应目录是 `video-backend/video-backend/scripts/windows`。

| 脚本                                          | 用途                                                                          | 常用命令                                                                                 |
| --------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `start.ps1`                                   | 手动入口，调用守护脚本启动 API                                                | `powershell -ExecutionPolicy Bypass -File .\start.ps1`                                   |
| `scripts\windows\start-backend-forever.ps1`   | 循环运行 `npm start`，进程退出后自动重启                                      | `powershell -ExecutionPolicy Bypass -File .\scripts\windows\start-backend-forever.ps1`   |
| `scripts\windows\run-crawl-once.ps1`          | 执行一次 `npm run crawl`，带 `data\crawl.lock` 防止重复抓取                   | `powershell -ExecutionPolicy Bypass -File .\scripts\windows\run-crawl-once.ps1`          |
| `scripts\windows\install-scheduled-tasks.ps1` | 注册 `VideoBackend-Api`，并默认启用每两周一次的 `VideoBackend-Crawl` 定时爬虫 | `powershell -ExecutionPolicy Bypass -File .\scripts\windows\install-scheduled-tasks.ps1` |

这些脚本默认从自身路径反推后端根目录。如果脚本不在 `C:\video-backend` 下，可以显式传入：

```powershell
powershell -ExecutionPolicy Bypass -File D:\your-backend\scripts\windows\install-scheduled-tasks.ps1 -BackendDir D:\your-backend
```

## 启动后端

临时前台启动：

```powershell
cd C:\video-backend
npm start
```

当前 `package.json` 中 `start` 应为：

```json
"start": "node src/server.js"
```

因为当前后端 `tsconfig` 没有配置 `dist` 输出目录，`npm run build` 会把 JS 编译到 `src` 旁边。不要再用 `node dist/server.js`。

启动成功后应看到类似：

```text
Server listening at http://127.0.0.1:3000
```

长期运行不要靠前台 PowerShell。请用“任务计划程序”守护后端：

```powershell
cd C:\video-backend
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install-scheduled-tasks.ps1
```

该脚本会注册两个任务：

- `VideoBackend-Api`：开机启动后端，进程退出后自动重启。
- `VideoBackend-Crawl`：默认启用，每 336 小时运行一次 `scripts\windows\run-crawl-once.ps1`，用于长期补库和保持分类覆盖。后续用户主动搜索仍由 `/api/search?q=关键词` 低频、限量补抓。

如果任务日志提示 `npm was not found in PATH`，说明 Node.js 只装在当前用户环境里。可以改用当前用户注册：

```powershell
cd C:\video-backend
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install-scheduled-tasks.ps1 -UseCurrentUser
```

任务和日志检查：

```powershell
Get-ScheduledTask -TaskName "VideoBackend-*"
Start-ScheduledTask -TaskName "VideoBackend-Api"
Get-ScheduledTask -TaskName "VideoBackend-Crawl" | Select-Object TaskName,State
Get-Content C:\video-backend\logs\server.log -Tail 80
Get-Content C:\video-backend\logs\crawl.log -Tail 80
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health
Invoke-RestMethod https://shipin.laig.top/api/health
```

Android 端如果日志出现 `Network request failed`，表示 App 没有拿到 HTTP 响应，优先检查手机/模拟器能否访问公网后端：

```powershell
adb shell cmd connectivity check-internet
adb shell ping -c 3 shipin.laig.top
adb shell curl -I https://shipin.laig.top/api/health
```

部分 Android 镜像没有 `curl` 或 `toybox wget`，这时用 Windows 侧先确认公网 API：

```powershell
Invoke-WebRequest https://shipin.laig.top/api/health -UseBasicParsing
Invoke-WebRequest "https://shipin.laig.top/api/videos?page=1&pageSize=48" -UseBasicParsing
```

如果 Windows 正常，但 Android App 仍然报 `Network request failed`，通常是 Android 设备侧 DNS、IPv6、TLS 证书链、Cloudflare 代理、代理设置、防火墙或移动网络出口问题，不是后端数据库数量问题。可以给 App 增加一个直连后端的 HTTPS 备用域名：

```env
EXPO_PUBLIC_VIDEO_API_BASE_URL=https://shipin.laig.top
EXPO_PUBLIC_VIDEO_API_FALLBACK_BASE_URL=https://api-direct.example.com
```

备用地址仍然只允许指向后端 API。不要配置网页站点，不恢复 WebView，不跳外部浏览器。`http://服务器IP:3000` 只适合临时诊断，Android 明文 HTTP 可能被系统策略拦截，长期方案应使用 HTTPS 域名。

## 抓取视频

手动抓取：

```powershell
cd C:\video-backend
npm run crawl
```

旧数据重分类：

```powershell
cd C:\video-backend
npm run reclassify
```

`npm run reclassify` 会按统一分类规则修正数据库中已有视频的 `category`、`subCategory` 和 `rawJson`。当旧库里大量电视剧被归到 `海外剧` 时，更新后端代码后先跑一次该命令。

抓取脚本入口：

```json
"crawl": "tsx src/jobs/crawlJob.ts",
"reclassify": "tsx src/scripts/reclassifyVideos.ts"
```

建议用两个 PowerShell 窗口：

1. 窗口 A：`npm start` 保持 API 服务运行。
2. 窗口 B：`npm run crawl` 执行抓取入库。

抓取完成后，App 通过 `/api/videos` 读取数据库内容。

一次性补库不能只按电视剧优先级吃满。爬虫采集详情页时必须按分类覆盖 `电视剧 / 电影 / 综艺 / 动漫`；推荐排序可以继续偏电视剧、国产剧，但入库内容必须保留电影、综艺、动漫。

默认抓取入库不限制视频数量、分类页数量、详情页候选数量或每个种子的详情页数量，依靠连续空页停止机制结束。`run-crawl-once.ps1` 也不得再默认写入 `120/160/2页` 这类小上限。只有临时小批量诊断时才手动设置这些环境变量：

```powershell
$env:CRAWL_MAX_VIDEOS="160"
$env:CRAWL_MAX_DETAIL_SCAN="240"
$env:CRAWL_MAX_DETAIL_SCAN_PER_SEED="32"
$env:CRAWL_MAX_CATEGORY_PAGES="2"
```

默认启用周期性自动抓取，但频率保持低：`VideoBackend-Crawl` 每 336 小时，也就是每两周运行一次。需要调整频率时显式传入 `-CrawlIntervalHours`；需要临时关闭定时爬虫时传入 `-DisableScheduledCrawl`：

```powershell
cd C:\video-backend
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install-scheduled-tasks.ps1 -CrawlIntervalHours 336 -CrawlStartDelayMinutes 30
powershell -ExecutionPolicy Bypass -File .\scripts\windows\install-scheduled-tasks.ps1 -DisableScheduledCrawl
```

API 进程内也不能默认启动爬虫 cron。`src/server.ts` 中的进程内爬虫只允许在显式设置 `ENABLE_IN_PROCESS_CRAWL_CRON=true` 时启用；正常部署保持关闭，避免 API 列表查询和爬虫同时抢 SQLite，导致 `/api/videos?page=2` 超时。

## 查看数据库统计

`app.db` 是 SQLite 二进制文件，不要用文本编辑器直接打开。看总量、分类、二级分类、来源类型和解析缓存状态时，用统计脚本：

```powershell
cd C:\video-backend
npm run inspect:videos
npm run inspect:videos -- --category=国产剧 --limit=20
npm run inspect:videos -- --category=韩剧 --limit=20
```

看 API 当前第一页返回数量：

```powershell
(Invoke-RestMethod "http://127.0.0.1:3000/api/videos?page=1&pageSize=200").items.Count
```

## API

```http
GET  /api/health
GET  /api/videos?page=1&pageSize=200
GET  /api/videos?cursor=...&pageSize=200
GET  /api/videos/:id
GET  /api/search?q=韩剧
POST /api/resolve
```

分页约定：

- `page` 从 `1` 开始。
- `pageSize` 最大 `200`。
- App 首页首屏默认请求第一页 `pageSize=48`，后端会返回 `nextCursor` 和 `hasMore`；App 优先用游标预取下一页，游标缺失时兼容旧 `page` 翻页。
- App 首页只拉全局 `/api/videos` 混合流，不把首页 tab 建在 `/api/videos?category=...` 上；分类 tab 使用已加载目录池本地过滤，避免某个分类查询慢时整页空白。
- App 使用“蓄水池”加载：冷启动先展示持久缓存，首屏加载后后台预取下一页，剩余未展示内容不足时继续补水，并提前预取下一屏封面。
- 后端数据库可以有几万条视频，但不要让 App 一次性全量拉取。
- `/api/videos` 无 `category` 时必须返回混合流，按 `电视剧 / 电影 / 综艺 / 动漫` 分组取数后交错输出，保证首页各 tab 首屏有机会拿到内容。
- `/api/videos?category=...` 是补充接口，不是首页主链路；查询应避免 `category OR subCategory` 这种慢条件，一级分类查 `category`，二级分类查 `subCategory`。
- `/api/videos` 和 `/api/search` 必须只查基础列，不读取 `rawJson`，否则列表会随着剧集数量变慢。
- `/api/search` 必须先按搜索相关性排序，再叠加国产剧/韩剧/电视剧偏好。
- `/api/search` 先查本地 SQLite；本地没有任何命中时，才按该关键词检索源站并只抓取源站搜索结果里的 1 个视频入库。默认同一关键词 30 分钟内只触发一次补抓，避免用户连续搜索导致源站风控。
- `/api/videos`、`/api/search`、`/api/videos/:id` 使用短 TTL 内存缓存，连续刷新和重复进入详情应命中 `x-cache: HIT`。后端启动和抓取完成后会预热常用首页、分类页和下一页缓存。
- 可用环境变量调整缓存：`VIDEO_LIST_CACHE_TTL_MS`、`VIDEO_SEARCH_CACHE_TTL_MS`、`VIDEO_DETAIL_CACHE_TTL_MS`。

`/api/videos` 和 `/api/search` 返回轻量列表项，不返回完整 `playLines`，避免移动端列表响应过大。进入详情或播放器时再通过 `/api/videos/:id` 获取完整线路和剧集。

```json
{
  "hasMore": true,
  "items": [
    {
      "id": "video-id",
      "title": "剧名",
      "source": "https://example.com/play/1-1-1.html",
      "sourceType": "unsupported",
      "category": "电视剧",
      "subCategory": "韩剧",
      "playableInApp": false,
      "unsupportedReason": "需要通过 /api/resolve 懒解析播放地址",
      "playPageUrl": "https://example.com/play/1-1-1.html",
      "lineCount": 2,
      "episodeCount": 16
    }
  ],
  "nextCursor": "%7B%22id%22%3A%22video-id%22%2C%22rank%22%3A1%2C%22updatedAt%22%3A%222026-06-02T00%3A00%3A00.000Z%22%7D",
  "page": 1,
  "pageSize": 48
}
```

`/api/videos/:id` 返回完整视频项，允许包含 `playLines[].episodes[]`。

`/api/resolve` 请求：

```json
{
  "videoId": "video-id",
  "line": 1,
  "episode": 1,
  "playPageUrl": "https://example.com/play/1-1-1.html"
}
```

`/api/resolve` 成功返回：

```json
{
  "mediaUrl": "https://cdn.example.com/video.m3u8",
  "format": "m3u8",
  "sourceType": "m3u8",
  "reachable": true
}
```

`/api/resolve` 会缓存成功的直链结果和短期失败原因。成功缓存默认保留 24 小时，失败缓存默认保留 30 分钟，用于避免同一集反复访问源站导致风控；可用 `RESOLVE_SUCCESS_CACHE_TTL_MS` 和 `RESOLVE_FAILURE_CACHE_TTL_MS` 覆盖。

`/api/resolve` 默认使用 native HTTP(S) 请求优先，并把源站页面抓取控制在 `RESOLVE_FETCH_TIMEOUT_MS=12000` 左右；同一集并发解析会合并成一次请求。不要把解析超时设置得过长，否则 App 播放页会长时间转圈。

## 数据契约

- `category` 必须是 `电影`、`电视剧`、`综艺`、`动漫` 之一。
- `韩剧`、`国产剧`、`日剧`、`欧美剧` 等放到 `subCategory`。
- `海外剧` 只作为最后兜底。标题、简介、地区、语言或来源路径能识别出国产/韩/日/港台/欧美/泰剧时，必须归入对应二级分类。
- 未解析到直链前，`sourceType` 用 `unsupported`，`playableInApp` 用 `false`。
- 后端可以只返回 `playLines[*].episodes[*].playPageUrl`，App 会播放前调用 `/api/resolve`。
- `/api/videos` 返回空数组不能表示删除全部内容；App 会保留旧缓存。
- 不返回前端不认识的 `sourceType`，例如 `webpage`。
- 不向 App 展示内部资源站名；旧数据库中的内部 provider 会在 API 出口转换成公开来源标签。
- 不做 DRM 绕过、下载绕过、解密或脚本注入播放。

## Caddy

`Caddyfile` 最小配置：

```caddyfile
shipin.laig.top {
  reverse_proxy 127.0.0.1:3000
}
```

格式化并校验配置：

```powershell
cd C:\caddy
.\caddy.exe fmt --overwrite C:\caddy\Caddyfile
.\caddy.exe validate --config C:\caddy\Caddyfile
```

前台运行 Caddy：

```powershell
cd C:\caddy
.\caddy.exe run --config C:\caddy\Caddyfile
```

前台 `run` 只适合排错。你当前的 `caddy.exe` 不支持 `service install/start` 子命令，长期运行请用计划任务：

```powershell
cd C:\caddy
$action = New-ScheduledTaskAction -Execute "C:\caddy\caddy.exe" -Argument "run --config C:\caddy\Caddyfile" -WorkingDirectory "C:\caddy"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName "Caddy-ReverseProxy" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force
Start-ScheduledTask -TaskName "Caddy-ReverseProxy"
```

更新 `Caddyfile` 后：

```powershell
cd C:\caddy
.\caddy.exe validate --config C:\caddy\Caddyfile
Stop-ScheduledTask -TaskName "Caddy-ReverseProxy"
Start-ScheduledTask -TaskName "Caddy-ReverseProxy"
```

检查监听：

```powershell
Get-ScheduledTask -TaskName "Caddy-ReverseProxy"
Get-NetTCPConnection -LocalPort 3000 -State Listen
Get-NetTCPConnection -LocalPort 80 -State Listen
Get-NetTCPConnection -LocalPort 443 -State Listen
```

如果本地 `127.0.0.1:3000` 正常，但公网 `https://shipin.laig.top` 失败，优先检查 Caddy 是否运行、80/443 是否放行、Cloudflare DNS/代理状态。

## 常见问题

### `Cannot find module dist/server.js`

原因：启动脚本指向了旧的 `dist/server.js`。

修复：

```powershell
cd C:\video-backend
node -e "const fs=require('fs'); const p='package.json'; const j=JSON.parse(fs.readFileSync(p,'utf8')); j.scripts.start='node src/server.js'; fs.writeFileSync(p, JSON.stringify(j,null,2));"
npm run build
npm start
```

### Prisma schema 第一行报错

通常是 `schema.prisma` 编码或内容损坏。最常见原因是服务器 PowerShell 用 `Set-Content -Encoding UTF8` 写入了 UTF-8 BOM，Prisma 7 会在第 1 行附近报 `P1012`。确保文件是 UTF-8 无 BOM，并且开头是：

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}
```

修复时用 UTF-8 无 BOM 写回文件，不要用 `Set-Content -Encoding UTF8`：

```powershell
$schema = Get-Content C:\video-backend\prisma\schema.prisma -Raw
$schema = $schema.TrimStart([char]0xFEFF)
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText("C:\video-backend\prisma\schema.prisma", $schema, $utf8NoBom)
```

然后执行：

```powershell
npm run prisma:push
```

### 源站 `Empty reply from server`

如果服务器访问源站时出现：

```text
curl: (52) Empty reply from server
```

先确认命令写法。`ping` 和 `nslookup` 只能写域名，不能带 `https://` 或路径：

```powershell
nslookup www.wanmeikk.me
ping www.wanmeikk.me
Test-NetConnection www.wanmeikk.me -Port 443
```

再用 GET 请求测 HTTP/TLS，`-I` 是 HEAD 请求，部分站点可能拒绝：

```powershell
curl.exe -v -L --http1.1 --ssl-no-revoke --max-time 20 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36" "https://www.wanmeikk.me/play/18491-1-1.html" -o NUL
```

如果 DNS 解析到 `156.239.224.8` 后 TCP/TLS 成功但 GET 后直接断开，而强制可用节点能返回 `HTTP/1.1 200 OK`：

```powershell
curl.exe -v -L --http1.1 --ssl-no-revoke --max-time 20 --resolve www.wanmeikk.me:443:70.36.96.152 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36" "https://www.wanmeikk.me/play/18491-1-1.html" -o NUL
```

说明不是后端解析代码问题，也不一定是源站封禁；更可能是当前 DNS/CDN 分配到了坏节点。可以在服务器 hosts 中临时固定可用节点：

```powershell
$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$hostName = "www.wanmeikk.me"
$goodIp = "70.36.96.152"
$backupPath = "$hostsPath.codex-backup-$(Get-Date -Format yyyyMMddHHmmss)"

Copy-Item -LiteralPath $hostsPath -Destination $backupPath

$lines = [System.IO.File]::ReadAllLines($hostsPath)
$next = New-Object System.Collections.Generic.List[string]
$foundGood = $false

foreach ($line in $lines) {
  $trim = $line.Trim()
  $parts = $trim -split "\s+"

  if ($trim -and -not $trim.StartsWith("#") -and ($parts -contains $hostName)) {
    if ($parts[0] -eq $goodIp) {
      $foundGood = $true
      $next.Add($line)
    } else {
      $next.Add("# disabled by video-backend $(Get-Date -Format s) $line")
    }
  } else {
    $next.Add($line)
  }
}

if (-not $foundGood) {
  $next.Add("$goodIp`t$hostName")
}

[System.IO.File]::WriteAllLines($hostsPath, $next, [System.Text.Encoding]::ASCII)
ipconfig /flushdns
```

固定 hosts 后重新不带 `--resolve` 测播放页；如果返回 `HTTP/1.1 200 OK`，再重启 `VideoBackend-Api` 并测试 `/api/resolve`。如果 `70.36.96.152` 后续不可用，应重新用 `--resolve` 验证新的可用 IP，不要盲目改 hosts。

### App 视频很少

先确认后端数量：

```powershell
(Invoke-RestMethod "http://127.0.0.1:3000/api/videos?page=1&pageSize=200").items.Count
```

如果后端数量少，先跑 `npm run crawl`。如果后端数量正常，再检查 App `.env` 是否指向 `https://shipin.laig.top`。
