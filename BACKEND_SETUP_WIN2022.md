# BACKEND_SETUP_WIN2022 后端搭建与代码约束

本文件是本项目后端服务的长期约束文档。以后凡是涉及后端搭建、后端代码、爬虫、分类映射、数据库、Caddy、接口返回结构、App 对接方式的修改，都必须先阅读本文件，并保持实现与本文一致。

当前强制约束摘要：

- 服务器系统：Windows Server 2022 Datacenter。
- 后端目录：`C:\video-backend`。
- 当前仓库内后端同步目录：`ios-video-app/video-backend/video-backend`，用于本机审阅和修改服务器代码；同步到服务器时仍放回 `C:\video-backend`。
- 对外 API 域名：`https://shipin.laig.top`。
- App 端只负责展示、搜索、收藏、历史和播放；后端负责抓取、分类、缓存、接口和解析。
- 后端返回给 App 的 `category` 必须是 `电影`、`电视剧`、`综艺`、`动漫` 之一。
- `韩剧`、`国产剧`、`日剧`、`欧美剧` 等必须写入 `subCategory`，不能写入 `category`。
- App 会兼容历史/异常 DTO：缺失或未知 `category` 不会让后端视频被静默丢弃，但后端新代码仍必须输出正确一级分类，避免 UI 分类和推荐解释失真。
- 未解析到真实播放地址前，普通 `playPageUrl` / episode 的 `sourceType` 必须使用 `unsupported`，`playableInApp` 必须为 `false`；不要使用前端类型里不存在的 `webpage`，也不要让 App 打开播放网页。
- App 配置后端 API 后优先消费后端；生产环境不要依赖移动端本地爬虫，只有开发/兜底场景才打开 `EXPO_PUBLIC_ENABLE_LOCAL_CRAWLER=true`。
- `mp4`、`m3u8`、`hls` 等直链交给 App 原生播放器；`playPageUrl` 只作为 `/api/resolve` 的解析线索，解析不出直链就返回失败，不走 WebView fallback、不跳外部浏览器；不要实现 DRM 绕过、下载或解密逻辑。
- 用户当前要求后端抓取“无上限，直到抓完”；代码默认不限制视频数量、详情页数量和单剧集数，但必须保留连续空页停止机制。
- 后续后端修改必须同步更新本文件对应约束或状态。

---

# Windows Server 2022 后端部署方案

本文档面向当前 `ios-video-app`，后端服务器环境为 Windows Server 2022 Datacenter。目标是把移动端重爬虫逐步迁到后端，App 只请求 API、播放、收藏和记录历史。

## 1. 环境准备

### 1.1 必需软件

服务器当前只安装了 Zulu Java 25。Java 对这个 Node 后端不是必需项，可以保留，但后端还需要：

- Node.js 22 LTS 或 20 LTS
- Git for Windows
- Caddy
- 一个域名或可访问的公网 IP

Node.js 推荐用官方 LTS 安装包，安装后在管理员 PowerShell 检查：

```powershell
node -v
npm -v
```

Git 安装后检查：

```powershell
git --version
```

### 1.2 创建目录

```powershell
New-Item -ItemType Directory -Force C:\video-backend
New-Item -ItemType Directory -Force C:\video-backend\data
New-Item -ItemType Directory -Force C:\video-backend\logs
New-Item -ItemType Directory -Force C:\caddy
```

不要把 token、Cookie、账号密码写进 Git 仓库。后端 `.env` 只放在服务器本机。

### 1.3 防火墙

测试期可以临时开放 3000：

```powershell
New-NetFirewallRule -DisplayName "video-backend-3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

正式期只需要开放 80/443，让 Caddy 转发到本机 3000：

```powershell
New-NetFirewallRule -DisplayName "HTTP-80" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
New-NetFirewallRule -DisplayName "HTTPS-443" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```

### 1.4 域名 DNS

如果域名是 `yourdomain.com`，建议加一条 A 记录：

```text
api.yourdomain.com -> 你的 Windows 服务器公网 IP
```

App 里最终配置：

```env
EXPO_PUBLIC_VIDEO_API_BASE_URL=https://api.yourdomain.com
```

## 2. 后端项目骨架

### 2.1 初始化

```powershell
cd C:\video-backend
npm init -y
npm install fastify @fastify/cors @fastify/rate-limit dotenv node-cron zod prisma @prisma/client
npm install -D typescript tsx @types/node
npx tsc --init
npx prisma init --datasource-provider sqlite
```

### 2.2 package.json scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "crawl": "tsx src/jobs/crawlJob.ts",
    "prisma:push": "prisma db push"
  }
}
```

### 2.3 .env

```env
PORT=3000
DATABASE_URL=file:C:/video-backend/data/app.db
API_TOKEN=普通 App 读接口 token，可选
ADMIN_TOKEN=管理接口长随机 token，不要放进 App
CRAWL_INTERVAL_MINUTES=30
```

### 2.4 prisma/schema.prisma

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

model Video {
  id          String   @id
  title       String
  description String?
  cover       String?
  source      String
  sourceType  String
  category    String
  subCategory String?
  provider    String?
  seriesId    String?
  rawJson     String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  lines       PlayLine[]
}

model PlayLine {
  id       String @id
  videoId  String
  line     Int
  label    String
  video    Video  @relation(fields: [videoId], references: [id])
  episodes Episode[]

  @@unique([videoId, line])
}

model Episode {
  id              String   @id
  videoId         String
  lineId          String
  line            Int
  episode         Int
  episodeLabel    String?
  playPageUrl     String
  mediaUrl        String?
  mediaResolvedAt DateTime?
  reachable       Boolean?
  lineRef         PlayLine @relation(fields: [lineId], references: [id])

  @@unique([videoId, line, episode])
}

model CrawlJob {
  id         String   @id
  status     String
  startedAt  DateTime @default(now())
  finishedAt DateTime?
  error      String?
}
```

初始化数据库：

```powershell
npx prisma db push
```

## 3. 后端必要代码

### 3.1 src/server.ts

```ts
import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { registerVideoRoutes } from './routes/videos';
import { registerAdminRoutes } from './routes/admin';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

app.get('/api/health', async () => ({
  ok: true,
  updatedAt: new Date().toISOString(),
}));

await registerVideoRoutes(app);
await registerAdminRoutes(app);

const port = Number(process.env.PORT ?? 3000);
await app.listen({ host: '127.0.0.1', port });
```

### 3.2 src/db/prisma.ts

```ts
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

### 3.3 src/routes/videos.ts

```ts
import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma';
import { resolveEpisode } from '../services/resolveEpisode';

const parseRawVideo = (rawJson: string) => JSON.parse(rawJson);

export async function registerVideoRoutes(app: FastifyInstance) {
  app.get('/api/videos', async (request) => {
    const query = request.query as { category?: string; page?: string; pageSize?: string };
    const page = Math.max(Number(query.page ?? 1), 1);
    const pageSize = Math.min(Math.max(Number(query.pageSize ?? 30), 1), 100);

    const rows = await prisma.video.findMany({
      where: query.category ? { category: query.category } : undefined,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return { items: rows.map((row) => parseRawVideo(row.rawJson)) };
  });

  app.get('/api/videos/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await prisma.video.findUnique({ where: { id } });

    if (!row) {
      return reply.code(404).send({ message: 'Video not found' });
    }

    return { item: parseRawVideo(row.rawJson) };
  });

  app.get('/api/search', async (request) => {
    const { q } = request.query as { q?: string };
    const keyword = (q ?? '').trim();

    if (!keyword) {
      return { items: [] };
    }

    const rows = await prisma.video.findMany({
      where: {
        OR: [
          { title: { contains: keyword } },
          { description: { contains: keyword } },
          { category: { contains: keyword } },
          { subCategory: { contains: keyword } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 80,
    });

    return { items: rows.map((row) => parseRawVideo(row.rawJson)) };
  });

  app.post('/api/resolve', async (request) => {
    const body = request.body as {
      videoId: string;
      line: number;
      episode: number;
      playPageUrl?: string;
    };

    return resolveEpisode(body);
  });
}
```

### 3.4 src/services/resolveEpisode.ts

第一版可以先复用从 App 迁移出来的 `fetchEpisodeMediaUrl()` 解析逻辑。返回给 App 的结构必须是：

```ts
export async function resolveEpisode(input: {
  videoId: string;
  line: number;
  episode: number;
  playPageUrl?: string;
}) {
  if (!input.playPageUrl) {
    throw new Error('playPageUrl is required');
  }

  // TODO: 把 App 里的 webCrawlerService.fetchEpisodeMediaUrl 迁到后端后在这里调用。
  const result = await fetchEpisodeMediaUrl(input.playPageUrl);

  return {
    mediaUrl: result.mediaUrl,
    format: result.format,
    sourceType: result.sourceType,
    reachable: true,
  };
}
```

### 3.5 src/routes/admin.ts

```ts
import type { FastifyInstance } from 'fastify';
import { runCrawlJob } from '../jobs/crawlJob';

const requireAdmin = (authorization?: string) => {
  const expected = process.env.ADMIN_TOKEN;

  if (!expected || authorization !== `Bearer ${expected}`) {
    throw new Error('Unauthorized');
  }
};

export async function registerAdminRoutes(app: FastifyInstance) {
  app.post('/api/admin/crawl', async (request, reply) => {
    try {
      requireAdmin(request.headers.authorization);
      await runCrawlJob();
      return { ok: true };
    } catch (error) {
      return reply.code(401).send({
        message: error instanceof Error ? error.message : 'Unauthorized',
      });
    }
  });
}
```

### 3.6 src/jobs/crawlJob.ts

这里把 App 里的 `webCrawlerService.ts`、分类、格式识别逐步迁到后端。第一版目标是入库同构 `VideoItem`：

```ts
import { prisma } from '../db/prisma';

export async function runCrawlJob() {
  // TODO: 迁移 App 的 crawlConfiguredAuthorizedWebPages + normalize 逻辑到后端。
  const videos = await crawlAndNormalizeVideosOnServer();

  for (const video of videos) {
    await prisma.video.upsert({
      where: { id: video.id },
      create: {
        id: video.id,
        title: video.title,
        description: video.description,
        cover: video.cover,
        source: video.source,
        sourceType: video.sourceType,
        category: String(video.category),
        subCategory: video.subCategory,
        provider: video.provider,
        seriesId: video.seriesId,
        rawJson: JSON.stringify(video),
      },
      update: {
        title: video.title,
        description: video.description,
        cover: video.cover,
        source: video.source,
        sourceType: video.sourceType,
        category: String(video.category),
        subCategory: video.subCategory,
        provider: video.provider,
        seriesId: video.seriesId,
        rawJson: JSON.stringify(video),
      },
    });
  }
}

if (require.main === module) {
  runCrawlJob().finally(() => process.exit(0));
}
```

## 4. Caddy HTTPS 反代

把 `caddy.exe` 放到 `C:\caddy\caddy.exe`，创建 `C:\caddy\Caddyfile`：

```caddyfile
api.yourdomain.com {
  reverse_proxy 127.0.0.1:3000
}
```

注册 Windows 服务：

```powershell
sc.exe create caddy start= auto binPath= "C:\caddy\caddy.exe run --config C:\caddy\Caddyfile --adapter caddyfile"
sc.exe start caddy
```

## 5. 后端开机启动

创建 `C:\video-backend\start.ps1`：

```powershell
Set-Location C:\video-backend
$env:NODE_ENV="production"
node .\dist\server.js *> .\logs\server.log
```

注册任务计划：

```powershell
schtasks /create /tn "VideoBackend" /tr "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\video-backend\start.ps1" /sc onstart /ru SYSTEM /rl HIGHEST /f
schtasks /run /tn "VideoBackend"
```

## 6. 构建与验证

```powershell
cd C:\video-backend
npm install
npx prisma db push
npm run build
npm run start
```

本机测试：

```powershell
curl http://127.0.0.1:3000/api/health
```

公网测试：

```powershell
curl https://api.yourdomain.com/api/health
```

## 7. App 对接

当前 App 已支持后端 API。开发时在 `ios-video-app\.env` 配置：

```env
EXPO_PUBLIC_VIDEO_API_BASE_URL=https://api.yourdomain.com
EXPO_PUBLIC_VIDEO_API_TOKEN=
```

如果不配置 `EXPO_PUBLIC_VIDEO_API_BASE_URL`，App 会通过 provider registry 判断是否允许本地爬虫兜底：development 默认允许；production 不会自动重爬，除非显式配置 `EXPO_PUBLIC_ENABLE_LOCAL_CRAWLER=true`。

App 期望后端接口：

```http
GET  /api/videos?page=1&pageSize=200
GET  /api/videos/:id
GET  /api/search?q=韩剧
POST /api/resolve
```

`/api/videos`、`/api/search` 返回：

```json
{
  "items": [
    {
      "id": "crawler-series-123",
      "title": "示例剧",
      "source": "https://example.com/play/123-1-1.html",
      "sourceType": "unsupported",
      "category": "电视剧",
      "subCategory": "韩剧",
      "playableInApp": false,
      "unsupportedReason": "需要通过 /api/resolve 懒解析播放地址",
      "webViewUrl": "https://example.com/play/123-1-1.html",
      "playLines": [
        {
          "line": 1,
          "label": "线路 1",
          "episodes": [
            {
              "episode": 1,
              "episodeLabel": "第1集",
              "playPageUrl": "https://example.com/play/123-1-1.html",
              "sourceType": "unsupported"
            }
          ]
        }
      ]
    }
  ]
}
```

`/api/resolve` 请求：

```json
{
  "videoId": "crawler-series-123",
  "line": 1,
  "episode": 1,
  "playPageUrl": "https://example.com/play/123-1-1.html"
}
```

`/api/resolve` 返回：

```json
{
  "mediaUrl": "https://example.com/index.m3u8",
  "format": "m3u8",
  "sourceType": "m3u8",
  "reachable": true
}
```

## 10. 2026-05-22 后端全量抓取与分类对齐归档

本文件是本项目后端服务的长期约束文档。以后凡是涉及后端搭建、后端代码、爬虫、分类映射、数据库、Caddy、接口返回结构、App 对接方式的修改，都必须先阅读本文件，并保持实现与本文一致。

当前后端目标：

- 服务器系统：Windows Server 2022 Datacenter。
- 后端目录：`C:\video-backend`。
- 当前仓库内后端同步目录：`ios-video-app/video-backend/video-backend`，用于本机审阅和修改服务器代码；同步到服务器时仍放回 `C:\video-backend`。
- 反向代理目录：`C:\caddy`。
- 对外 API 域名：`https://shipin.laig.top`。
- App 端只负责展示、搜索、收藏、历史和播放，不再承担重爬虫。
- 后端负责定时抓取、分类映射、SQLite 持久化、`/api/videos`、`/api/search`、`/api/videos/:id`、`/api/resolve`。

## 1. 后端代码总原则

- 后端代码修改前必须先读本文件。
- 后端新增或修改抓取逻辑时，必须和前端 `VideoItem` 结构兼容。
- 后端返回给 App 的 `category` 必须是前端一级分类之一：`电影`、`电视剧`、`综艺`、`动漫`。
- 不要把 `韩剧`、`国产剧`、`日剧`、`欧美剧` 等二级分类写到 `category`；它们必须写到 `subCategory`。
- App 会保留缺失/未知分类的后端视频并记录调试日志，这是为了兼容历史数据和聚合异常；不要依赖该兼容行为，后端仍应尽量在入库前完成分类映射。
- 未解析到真实播放地址前，普通 `playPageUrl` / episode 的 `sourceType` 必须使用 `unsupported`，不要标记 `playableInApp: true`，不要使用前端类型里不存在的 `webpage`，也不要返回 `playback: { type: 'webview' }`。
- `/api/resolve` 成功后才返回真实 `mediaUrl`，并使用 `sourceType: 'm3u8'`、`format: 'm3u8'` 或实际解析到的格式。
- 不要把 Cookie、token、账号密码、证书写入仓库；后端私密配置只放服务器本机 `.env`。
- 不要直接修改 `node_modules` 作为长期方案。
- 不要写递归删除、批量删除、通配符删除命令。

## 2. 前端兼容分类

后端必须严格输出以下分类，保证 App 首页一级分类和二级胶囊筛选稳定。

一级分类：

```text
电影
电视剧
综艺
动漫
```

二级分类：

```text
电影：动作片 / 喜剧片 / 爱情片 / 恐怖片 / 剧情片 / 战争片 / 动画电影
电视剧：国产剧 / 韩剧 / 日剧 / 港台剧 / 欧美剧 / 泰剧 / 海外剧
综艺：内地综艺 / 港台综艺 / 日韩综艺 / 欧美综艺
动漫：国漫 / 日漫 / 港台动漫 / 美漫 / 海外动漫
```

正确示例：

```ts
{
  id: 'wanmeikk-11105',
  title: '顺风妇产科',
  category: '电视剧',
  subCategory: '韩剧',
  sourceType: 'unsupported',
  playableInApp: false,
  unsupportedReason: '需要通过后端 /api/resolve 懒解析播放地址',
  playLines: [
    {
      line: 1,
      label: '线路 1',
      episodes: [
        {
          episode: 1,
          episodeLabel: '第1集',
          playPageUrl: 'https://www.wanmeikk.me/play/11105-1-1.html',
          sourceType: 'unsupported',
        },
      ],
    },
  ],
}
```

错误示例：

```ts
{ category: '韩剧' }
{ category: '电视剧', subCategory: undefined }
{ sourceType: 'webpage' }
```

## 3. 抓取策略

当前抓取源：

```text
https://www.wanmeikk.me
```

种子分类优先级必须优先具体剧种，再用通用电视剧兜底：

```text
hanju    -> 电视剧 / 韩剧
guoju    -> 电视剧 / 国产剧
rihan    -> 电视剧 / 日剧
gangju   -> 电视剧 / 港台剧
meiju    -> 电视剧 / 欧美剧
taiju    -> 电视剧 / 泰剧
tv       -> 电视剧 / 海外剧，兜底
dianying -> 电影 / 剧情片，后续按标题、关键词、地区推断二级分类
zongyi   -> 综艺 / 内地综艺，后续按标题、关键词、地区推断二级分类
dongman  -> 动漫 / 国漫，后续按标题、关键词、地区推断二级分类
```

去重规则：

- 详情页 URL 相同时只保留一条。
- 如果后续从更高优先级种子发现同一个详情页，必须升级该详情页的分类来源。
- 例如同一部剧先从 `tv` 抓到，后面从 `hanju` 抓到，应升级为 `电视剧 / 韩剧`。

全量抓取要求：

- 用户当前要求是“无上限，直到抓完”。
- 默认不限制视频数量。
- 默认不限制详情页数量。
- 默认不限制单剧集数。
- 但必须保留“连续空页停止”机制，不能无限猜分页。
- 建议保留请求延迟和并发限制，避免被源站限流。

默认参数约束：

```ts
const MAX_CATEGORY_PAGES = Number(process.env.CRAWL_MAX_CATEGORY_PAGES ?? Number.MAX_SAFE_INTEGER);
const MAX_DETAIL_SCAN = Number(process.env.CRAWL_MAX_DETAIL_SCAN ?? Number.MAX_SAFE_INTEGER);
const MAX_EPISODES_PER_VIDEO = Number(
  process.env.CRAWL_MAX_EPISODES_PER_VIDEO ?? Number.MAX_SAFE_INTEGER,
);
const DETAIL_CONCURRENCY = Number(process.env.CRAWL_DETAIL_CONCURRENCY ?? 4);
const REQUEST_DELAY_MS = Number(process.env.CRAWL_REQUEST_DELAY_MS ?? 120);
```

运行全量抓取前，清掉旧的环境变量上限：

```powershell
cd C:\video-backend
$env:CRAWL_MAX_VIDEOS=$null
$env:CRAWL_MAX_CATEGORY_PAGES=$null
$env:CRAWL_MAX_DETAIL_SCAN=$null
$env:CRAWL_MAX_EPISODES_PER_VIDEO=$null
npm run build
npm run crawl
```

## 4. 后端接口约束

必须保留以下接口：

```text
GET  /api/health
GET  /api/videos
GET  /api/videos/:id
GET  /api/search?q=关键词
POST /api/resolve
POST /api/admin/crawl
```

`GET /api/videos` 返回结构：

```ts
{
  items: VideoItem[]
}
```

`GET /api/videos/:id` 返回结构：

```ts
{
  item: VideoItem;
}
```

`GET /api/search?q=关键词` 返回结构：

```ts
{
  items: VideoItem[]
}
```

`POST /api/resolve` 请求结构：

```ts
{
  videoId: string;
  line: number;
  episode: number;
  playPageUrl?: string;
}
```

`POST /api/resolve` 成功返回：

```ts
{
  mediaUrl: string;
  sourceType: 'm3u8';
  format: 'm3u8';
  reachable?: boolean;
}
```

### 4.1 App 端解码与播放兜底约束

- App 会对后端 `VideoItem` 做防御性解码：旧数据里的 `category: '韩剧'` 会被归一到 `category: '电视剧'`，同时补入 `subCategory/rawCategory`，但后端新代码仍必须直接输出 `category: '电视剧'`、`subCategory: '韩剧'`。
- App 接收后端 DTO 时不再强制要求列表阶段一定有 `source` 直链；只要有 `id/title` 且存在 `source`、`playLines`、`playbackOptions`、`webViewUrl` 或 `playPageUrl` 任一播放线索，就会保留为可展示卡片。若没有 `playLines` 但有顶层 `playPageUrl/webViewUrl/source`，App 会合成 `默认线路 / 第 1 集`，让播放器统一走 `/api/resolve` 懒解析。完全没有播放线索的 DTO 也会被归一化为 `playback.type='unplayable'`，`unsupportedReason='missing-playback-info'`，并在调试日志中可见。
- App 只会在直链媒体、已解析 episode `mediaUrl` 或可播放 `playbackOptions` 存在时信任 `playableInApp: true`；只有 `playPageUrl` 的未解析集不要标成可播。
- 后端可以只返回 `playLines[*].episodes[*].playPageUrl`，真正 `mediaUrl` 由播放器进入某集时调用 `/api/resolve` 懒解析；解析失败时 App 会尝试同一集的下一条线路，全部失败才展示“尝试其他来源/线路”。
- `/api/videos` 返回空数组不会清掉 App 旧缓存；后端空结果应视为“本轮未抓到”，不要用空数组表达删除全部内容。
- `GET /api/videos/:id` 会在 App 详情/播放器缓存未命中时调用，不再只服务强制刷新；后端必须能按 `id` 或稳定 `seriesId` 返回单条。
- 配置 `EXPO_PUBLIC_VIDEO_API_BASE_URL` 后，App 先请求后端。移动端本地爬虫只作为开发/兜底能力：开发环境默认允许，生产环境必须显式配置 `EXPO_PUBLIC_ENABLE_LOCAL_CRAWLER=true` 才会在后端失败后启用。
- App 播放器只播放 direct media URL：`mp4`、`m3u8`、`hls` 等走原生播放器；`webViewUrl`、iframe 或普通网页播放页只能作为 `/api/resolve` 输入，解析失败就展示失败/不可播，不走 `react-native-webview` fallback，也不跳外部浏览器；DRM、加密、无授权内容不做绕过或下载。

### 4.2 后端输出归一化参考代码

当前仓库内后端副本已新增 `src/contracts/appVideoContract.ts`，并接入 `src/routes/videos.ts`、`src/jobs/crawlJob.ts`、`src/services/resolveEpisode.ts`。如果服务器上的 `C:\video-backend` 还没有这些改动，可把下面代码复制到同名文件，并按本仓库对应文件同步 import。

```ts
type AppCategory = '电影' | '电视剧' | '综艺' | '动漫';
type AppSourceType = 'mp4' | 'm3u8' | 'hls' | 'mov' | 'm4v' | 'webm' | 'mkv' | 'unsupported';

const TV_SUB_CATEGORIES = new Set(['韩剧', '国产剧', '日剧', '港台剧', '欧美剧', '泰剧', '海外剧']);
const DIRECT_SOURCE_TYPES = new Set<AppSourceType>([
  'mp4',
  'm3u8',
  'hls',
  'mov',
  'm4v',
  'webm',
  'mkv',
]);

const detectFormatFromUrl = (url?: string): AppSourceType => {
  const clean = String(url ?? '')
    .split('?')[0]
    .toLowerCase();
  if (clean.endsWith('.m3u8')) return 'm3u8';
  if (clean.endsWith('.mp4')) return 'mp4';
  if (clean.endsWith('.mov')) return 'mov';
  if (clean.endsWith('.m4v')) return 'm4v';
  if (clean.endsWith('.webm')) return 'webm';
  if (clean.endsWith('.mkv')) return 'mkv';
  return 'unsupported';
};

const mapCategoryForApp = (category?: string, subCategory?: string): AppCategory => {
  if (category === '电影' || category === '综艺' || category === '动漫') return category;
  if (
    category === '电视剧' ||
    category === '韩剧' ||
    TV_SUB_CATEGORIES.has(String(subCategory ?? ''))
  ) {
    return '电视剧';
  }
  return '电影';
};

export const toAppVideoItem = (raw: any) => {
  const category = mapCategoryForApp(raw.category, raw.subCategory);
  const rawCategory = raw.rawCategory ?? raw.category;
  const sourceType = DIRECT_SOURCE_TYPES.has(raw.sourceType)
    ? raw.sourceType
    : detectFormatFromUrl(raw.source ?? raw.mediaUrl);
  const hasDirectSource = DIRECT_SOURCE_TYPES.has(sourceType) && Boolean(raw.source);
  const playLines = Array.isArray(raw.playLines) ? raw.playLines : [];

  return {
    ...raw,
    category,
    rawCategory,
    subCategory: category === '电视剧' && raw.category === '韩剧' ? '韩剧' : raw.subCategory,
    sourceType: hasDirectSource ? sourceType : 'unsupported',
    format: hasDirectSource ? sourceType : raw.format,
    playableInApp: hasDirectSource,
    unsupportedReason: hasDirectSource
      ? undefined
      : '需要通过 /api/resolve 懒解析出直链后播放，不打开网页',
    webViewUrl: raw.webViewUrl ?? raw.playPageUrl,
    playLines: playLines.map((line: any, lineIndex: number) => ({
      line: Number(line.line ?? lineIndex + 1),
      label: line.label ?? `线路 ${lineIndex + 1}`,
      episodes: Array.isArray(line.episodes)
        ? line.episodes.map((episode: any, episodeIndex: number) => {
            const mediaUrl = episode.mediaUrl;
            const episodeType = detectFormatFromUrl(mediaUrl);
            const hasEpisodeMedia = DIRECT_SOURCE_TYPES.has(episodeType) && Boolean(mediaUrl);
            return {
              episode: Number(episode.episode ?? episodeIndex + 1),
              episodeLabel: episode.episodeLabel ?? `第${episodeIndex + 1}集`,
              playPageUrl: episode.playPageUrl,
              mediaUrl,
              sourceType: hasEpisodeMedia ? episodeType : 'unsupported',
              format: hasEpisodeMedia ? episodeType : undefined,
            };
          })
        : [],
    })),
  };
};

export const toResolveResponse = (mediaUrl: string) => {
  const sourceType = detectFormatFromUrl(mediaUrl);
  if (!DIRECT_SOURCE_TYPES.has(sourceType)) {
    throw new Error('resolve-result-is-not-direct-media');
  }
  return {
    mediaUrl,
    format: sourceType,
    sourceType,
    reachable: true,
  };
};
```

## 5. Windows Server 2022 环境

已知环境：

- 用户已安装 Zulu Java 25，但 Node 后端不依赖 Java。
- 后端需要 Node.js LTS、npm、TypeScript、tsx、Fastify、Prisma、SQLite。
- 服务器建议使用 VS Code Remote / VS Code 桌面连接 VNC 后直接打开 `C:\video-backend`，减少纯 PowerShell 操作压力。

后端依赖：

```powershell
cd C:\video-backend
npm install fastify @fastify/cors @fastify/rate-limit dotenv node-cron zod prisma @prisma/client @prisma/adapter-better-sqlite3 better-sqlite3 cheerio
npm install -D typescript tsx @types/node
```

常用 scripts：

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node src/server.js",
    "crawl": "tsx src/jobs/crawlJob.ts",
    "prisma:push": "prisma db push"
  }
}
```

当前后端 `tsconfig.json` 没有配置 `outDir: "dist"`，`tsc` 会把 `.js/.d.ts` 产物生成在 `src` 旁边，因此 `start` 必须指向 `node src/server.js`。如果未来改成 `dist` 输出，需要同步调整 `tsconfig.json`、Prisma generated client 路径和本文档。

## 6. Prisma 7 约束

当前后端使用 Prisma 7 时，推荐生成客户端到项目内目录，并通过 SQLite adapter 初始化。

`prisma/schema.prisma` 约束：

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "sqlite"
}

model Video {
  id          String   @id
  title       String
  description String?
  cover       String?
  source      String
  sourceType  String
  category    String
  subCategory String?
  provider    String?
  seriesId    String?
  rawJson     String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

`src/db/prisma.ts` 约束：

```ts
import 'dotenv/config';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../generated/prisma/client.js';

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? 'file:C:/video-backend/data/app.db',
});

export const prisma = new PrismaClient({ adapter });
```

## 7. Caddy 与域名

当前 App 配置的后端地址：

```text
https://shipin.laig.top
```

Caddyfile 应放在：

```text
C:\caddy\Caddyfile
```

基础反代配置：

```caddyfile
shipin.laig.top {
  reverse_proxy 127.0.0.1:3000
}
```

校验：

```powershell
cd C:\caddy
.\caddy.exe validate --config C:\caddy\Caddyfile
```

测试：

```powershell
curl http://127.0.0.1:3000/api/health
curl https://shipin.laig.top/api/health
curl https://shipin.laig.top/api/videos
```

## 8. App 对接状态

App 已配置后端地址：

```text
https://shipin.laig.top
```

App 行为约束：

- 配置后端 API 后，App 通过 `src/data/providers/providerRegistry.ts` 优先请求后端 `/api/videos`，provider 选择结果会输出可排查日志，便于确认为什么没有走后端。
- 后端失败时，App 仍可按环境开关回落到本地旧爬虫逻辑；development 默认允许兜底，production 必须显式配置 `EXPO_PUBLIC_ENABLE_LOCAL_CRAWLER=true`。正式上线目标是后端稳定后不再依赖移动端重爬虫。
- 播放器进入某集时优先请求后端 `/api/resolve`。
- `/api/resolve` 失败时，App 可尝试本地解析兜底；仍解析不出 direct media URL 时只展示不可播，不打开网页。

## 9. 后续后端修改检查清单

每次改后端前检查：

- 是否先阅读本文件。
- 是否保持 `category` 和 `subCategory` 与前端枚举一致。
- 是否避免使用前端不认识的 `sourceType`。
- 是否没有把密钥写入仓库。
- 是否没有加入批量删除或递归删除命令。
- 是否能通过 `npm run build`。
- 是否能通过 `curl http://127.0.0.1:3000/api/health`。
- 是否能通过 `curl https://shipin.laig.top/api/videos`。

---

以下为历史内容，原文件存在编码异常；后续以本文件顶部的清晰约束为准，本段以下内容仅保留作为旧记录。
