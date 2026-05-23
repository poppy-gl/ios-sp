# ios-sp

ios的视频项目

## 前端数据来源策略

这是一个聚合视频 App，生产主链路推荐始终使用后端 API。App 端通过
`src/data/providers/providerRegistry.ts` 选择数据来源：

- 配置了 `EXPO_PUBLIC_VIDEO_API_BASE_URL` 时，`backendProvider` 优先级最高。
- 本地 crawler 只作为 fallback，用于授权来源、开发调试或后端临时不可用时兜底。
- 未配置后端时，development 默认允许本地 crawler 兜底。
- production 未配置后端时不会自动启动重型本地爬虫，除非显式设置
  `EXPO_PUBLIC_ENABLE_LOCAL_CRAWLER=true`。

## 后端 API 配置

开发或生产环境在 `.env` 中配置：

```env
EXPO_PUBLIC_VIDEO_API_BASE_URL=https://shipin.laig.top
EXPO_PUBLIC_VIDEO_API_TOKEN=
```

`EXPO_PUBLIC_VIDEO_API_BASE_URL` 指向后端服务，App 会优先请求
`/api/videos`、`/api/search`、`/api/videos/:id` 和 `/api/resolve`。

后端列表 DTO 不必在 `/api/videos` 阶段就提供最终 `mediaUrl`。只要返回
`id/title`，并带有 `source`、`playLines`、`playbackOptions`、`webViewUrl`
或 `playPageUrl` 任一播放线索，App 就会保留该视频；播放页进入具体集数时再通过
`/api/resolve` 懒解析直链。

如果后端只有顶层 `playPageUrl` / `webViewUrl`，App 会合成一个默认线路和第 1 集，
继续走统一的 `/api/resolve` 懒解析链路。后端缺失或未知 `category` 的历史 DTO
不会被 App 静默丢弃，但新后端仍应输出 `电影`、`电视剧`、`综艺`、`动漫` 之一，
韩剧等二级偏好放到 `subCategory`。

## 本地 crawler fallback

本地 crawler 开关：

```env
EXPO_PUBLIC_ENABLE_LOCAL_CRAWLER=true
```

该开关只表示允许 App 在 provider registry 判定可兜底时调用本地授权爬虫。
它不是生产推荐配置；正式使用应优先保证后端稳定抓取、聚合、去重、健康检查和解析。
