# Architecture

本项目是聚合视频 App，不是单一资源站播放器。文档只保留必须遵守的工程边界。

## 目录分层

- `app`: Expo Router 路由入口，只做路由和 feature 组合。
- `src/features`: 页面级功能模块，例如 home、player、search、video-detail。
- `src/domain`: 纯业务规则，例如 video model、recommendation、category、ranking。
- `src/data`: API、cache、provider、repository、normalizer。
- `src/infra`: env、storage、logger、player engine、crawler 等底层实现。
- `src/services`: 兼容旧 import 的 facade，必须逐步变薄。

依赖方向：

```text
app -> features
features -> domain / data / infra
data -> domain / infra
services -> data / domain / infra
domain -> no React / no Expo / no AsyncStorage / no fetch
```

## 数据策略

- 后端优先。App 配置 `EXPO_PUBLIC_VIDEO_API_BASE_URL` 后默认只走后端 provider。
- 本地 crawler 只做授权来源的开发/兜底能力。配置后端后，必须显式设置 `EXPO_PUBLIC_ENABLE_LOCAL_CRAWLER=true` 才允许本地 crawler fallback。
- 后端负责抓取、聚合、去重、健康检查和 `/api/resolve`。
- App 负责展示、搜索、收藏、历史、播放、线路切换和失败提示。
- `/api/videos` 使用分页读取，App 首页首屏拉第一页，触底后继续拉下一页；不要在启动时一次性拉完整数据库。
- 内部资源站/provider 名称不直接展示给用户，UI 只能使用公开来源标签。

## 内容策略

- 韩剧/电视剧偏好是产品策略，不是错误。
- 偏好只能集中在 `src/domain/recommendation/contentPreferencePolicy.ts` 和 `rankVideos.ts`。
- 后端列表可以按产品策略优先返回韩剧和电视剧，但分类识别不要伪造为推荐偏好。
- 分类识别和推荐偏好分开：分类回答“它是什么”，推荐回答“它排多高”。
- `海外剧` 是分类兜底，不是默认归宿；能从标题、简介、地区、语言或来源路径识别出具体二级分类时必须映射到对应分类。

## 播放策略

- 页面不得直接 import `expo-av`、`expo-video`、`react-native-video` 或 `react-native-webview`。
- 播放器必须通过 `src/infra/player/playerEngineSelector.ts`。
- `mp4/m3u8/hls` 等 direct media URL 走原生播放器。
- `playPageUrl`、`webViewUrl`、iframe URL 只能作为 `/api/resolve` 或显式允许的本地 resolver 输入。
- 当前产品策略是始终不要打开网页：不恢复 WebView fallback，不跳外部浏览器。
- 不做 DRM 绕过、下载绕过、解密、注入脚本播放或授权规避。

## 工程守护

运行：

```powershell
npm.cmd run check:all
```

文件尺寸守护在 `scripts/check-file-size.js`：

- app route 超 80 行报警
- feature container 超 300 行报警
- hook 超 200 行报警
- service/facade 超 400 行报警
- domain 单文件超 500 行报警
- 新增文件超过 800 行直接失败

历史大文件只能临时 allowlist，并必须带 TODO 拆分方向。
