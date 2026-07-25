# QA Checklist

用于记录最小验收，不再按历史 Thread 展开。

## 必跑命令

普通代码改动：

```powershell
cd "E:\ios shipin\ios-video-app"
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
```

提交前完整检查：

```powershell
npm.cmd run check:all
```

后端改动：

```powershell
cd C:\video-backend
npm run build
Invoke-RestMethod http://127.0.0.1:3000/api/health
Get-ScheduledTask -TaskName "VideoBackend-*"
Get-ScheduledTask -TaskName "Caddy-ReverseProxy"
```

Android 网络验收：

```powershell
adb shell curl -I https://shipin.laig.top/api/health
adb shell curl -I "https://shipin.laig.top/api/videos?page=1&pageSize=48"
```

## 前端验收

- 首页、搜索、收藏、历史、设置、详情、播放器能进入。
- 搜索直接走后端 `/api/search`，不能为了搜索触发首页分页或本地全量抓取。
- 路由文件只做入口，不堆业务逻辑。
- 列表有加载、空状态、错误状态。
- 已有视频时，刷新失败不覆盖成整页加载失败。
- `待解析` 视频点击后走播放器懒解析。
- App 不打开网页、不渲染 WebView、不跳外部浏览器。
- 播放只使用 direct media URL。
- 首页冷启动能先展示持久缓存，首屏从后端加载第一页，并在用户触底前预取下一页。
- 首页滚动时优先消费已预取的视频池，剩余内容不足时能继续后台补水。
- Android 日志没有 `Network request failed`；如果出现，先按后端文档检查公网 HTTPS 链路。

## 后端验收

- `npm start` 能监听 `127.0.0.1:3000`。
- `npm run crawl` 能抓取并写入数据库。
- `npm run reclassify` 能修正旧库中错误的二级分类。
- `npm run inspect:videos` 能输出总量、分类、二级分类、来源类型和解析缓存统计。
- `scripts\windows\install-scheduled-tasks.ps1` 能注册 `VideoBackend-Api` 和 `VideoBackend-Crawl`。
- `Caddy-ReverseProxy` 计划任务存在，公网 `https://shipin.laig.top/api/health` 返回成功。
- `/api/videos?page=1&pageSize=200` 返回视频列表。
- `/api/videos?page=2&pageSize=48` 能返回第二页，App 触底加载依赖这个接口。
- `/api/videos?page=1&pageSize=48` 返回 `hasMore` 和 `nextCursor`。
- 使用第一页返回的 `nextCursor` 请求 `/api/videos?cursor=...&pageSize=48` 能拿到下一页。
- `/api/videos` 默认优先返回国产剧，其次韩剧、电视剧和其他内容。
- 连续请求同一个 `/api/videos`、`/api/search` 或 `/api/videos/:id`，响应头应能看到 `x-cache: HIT`。
- `category=国产剧` 和 `category=韩剧` 都能查询到对应结果。
- `/api/videos` 列表项不返回完整 `playLines`，只返回卡片轻量字段。
- `/api/videos/:id` 能返回单条视频。
- `/api/search?q=韩剧` 能返回搜索结果。
- `/api/resolve` 成功时返回 `mediaUrl`、`format`、`sourceType`，第二次解析同一集应命中缓存。

## 数据契约验收

- `category` 是 `电影`、`电视剧`、`综艺`、`动漫` 之一。
- 韩剧等二级分类放在 `subCategory`。
- `海外剧` 只能作为兜底；有明确地区/语言信号的视频应归入国产剧、韩剧、日剧、港台剧、欧美剧或泰剧。
- 只有 `playPageUrl`、尚无直链时，`playableInApp=false`，卡片应显示 `待解析` 而不是永久不可播放。
- App 卡片、详情、播放器不展示内部资源站名。
- 不返回前端不认识的 `sourceType`。
- 不使用空数组表达“删除全部视频”。

## 安全和工程红线

- 不提交密钥、token、Cookie、账号密码、证书。
- 不批量删除、不递归删除、不删除目录、不使用通配符删除。
- 不恢复旧静态视频源入口。
- 不做 DRM 绕过、下载绕过、解密或脚本注入播放。
- 韩剧/电视剧推荐偏好只放在 recommendation policy。

## 验收记录模板

```md
## 验收记录

- 日期:
- 修改范围:
- 命令:
  - `npm.cmd run typecheck`:
  - `npm.cmd run lint`:
  - `npm.cmd run format:check`:
  - `npm.cmd run check:all`:
- 前端验收:
- 后端验收:
- 风险/未覆盖:
- 结论:
```
