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

如果不配置 `EXPO_PUBLIC_VIDEO_API_BASE_URL`，App 会继续使用本地爬虫兜底。

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
      "sourceType": "webview",
      "category": "电视剧",
      "playableInApp": true,
      "playLines": []
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
