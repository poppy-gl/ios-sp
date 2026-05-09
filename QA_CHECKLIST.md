# QA Checklist

本文档用于 Thread 8 质量验证与验收记录，编号体系与根目录 `AGENTS.md` 保持一致。它只定义验收标准、记录模板和最小验证命令，不改变业务逻辑。

## 最小验证规则

- 默认验证：业务逻辑、类型、服务、页面或文档体系变更后至少执行 `npm.cmd run typecheck`。
- UI、页面路由、组件 import/export、主题样式、导航结构有较大改动时，额外执行 `npm.cmd run lint`。
- 格式化规则或大批文档排版变更时，额外执行 `npm.cmd run format:check`。
- 涉及网络、爬取、AI、下载、数据持久化的改动，必须确认失败兜底、空数据、超时或不可用场景。
- 验收记录必须包含功能验收项、兼容性项、合规项、命令项，不能只写“已跑命令”。

## 通用命令

```powershell
cd "E:\ios shipin\ios-video-app"
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
adb reverse tcp:8081 tcp:8081
npx expo start -c --localhost
```

说明：

- `npm.cmd run lint` 在 UI/import/路由/组件大改时必跑；窄范围服务修复可按风险选择。
- `npx expo start -c --localhost` 用于 Expo Go 或模拟器联调；启动异常时优先检查顶层 import 是否引入不兼容原生模块。
- EAS 构建需要先完成 `eas login`、项目配置和 Apple/iOS 凭据配置。

## Thread 1：项目基础与运行环境

功能验收项：

- Expo、React Native、TypeScript、EAS 和 npm scripts 版本互相兼容。
- `start`、`android`、`ios`、`web`、`lint`、`typecheck`、`format`、EAS 构建命令可复现。
- 不通过长期修改 `node_modules` 解决环境问题。

兼容性项：

- Windows 本地可安装依赖并启动 Expo 开发服务。
- Expo Go、Android 模拟器和 EAS development build 的原生依赖边界清晰。

合规项：

- 不提交 `.env`、密钥、token、证书或个人账号信息。
- 新增原生依赖前说明 Expo Go 与 EAS 兼容性。

命令项：

- 必跑：`npm.cmd run typecheck`
- 配置或依赖改动：`npm.cmd run lint`
- EAS 配置改动：检查 `app.json`、`eas.json`，必要时执行对应 EAS Build。

## Thread 2：路由与页面结构

功能验收项：

- Stack 路由、页面标题、加载态、错误态、空状态和页面跳转正常。
- 详情页和播放器页只通过视频 `id` 跳转。
- 每个路由文件默认导出 React 组件。

兼容性项：

- Expo Go 可进入首页、搜索、收藏、历史、设置、详情和播放页。
- 路由文件顶层不 import 未验证兼容的原生模块。

合规项：

- 不可播放网页可在 UI 上提供"在浏览器/外部播放器中打开"入口；具体来源合规由项目所有者承担。
- 不在路由层顶层 import `react-native-webview`，原因是 SDK 55 / Expo Go 兼容性，不是合规约束。

命令项：

- 必跑：`npm.cmd run typecheck`
- 页面/import 大改：`npm.cmd run lint`

## Thread 3：视频数据模型

功能验收项：

- `RawVideoSource`、`VideoItem`、`VideoPlayback`、格式、编码、分类和来源类型字段可表达当前管线。
- 新增字段优先可选，旧数据仍能归一化。
- 授权、格式检测、播放支持判断所需字段完整保留。

兼容性项：

- 页面、服务、store 的类型引用保持一致。
- 旧持久化数据不会因新增可选字段崩溃。

合规项：

- 不新增专用于破解商业 DRM 加密容器（FairPlay、Widevine、PlayReady）的字段语义；其他来源合规字段由项目所有者掌控。

命令项：

- 必跑：`npm.cmd run typecheck`

## Thread 4：演示数据与内置合法内容

功能验收项：

- `src/config/videoSources.ts` 和 `src/data/demoVideos.ts` 不被恢复。
- 不重新引入静态手动视频数组、旧 adapter 或旧用户源入口。
- 合法演示内容如需内置，只能通过 Thread 6.6 的授权网页源入口进入。

兼容性项：

- 首页、搜索、播放页仍从统一服务读取数据。
- 空授权源时有明确空状态或不可播放来源兜底。

合规项：

- 不通过旧静态入口数组（`USER_VIDEO_SOURCES`、`USER_REMOTE_API_ENDPOINTS`、`USER_CUSTOM_VIDEO_SOURCES`、`demoVideos`、`videoSources`、`legacy-` 前缀）重新引入数据；网页源统一收敛到 `AUTHORIZED_WEB_PAGE_SOURCES`，源合规由项目所有者承担。

命令项：

- 必跑：`npm.cmd run typecheck`

## Thread 5：视频服务与源适配器

功能验收项：

- `listVideoItems`、`getVideoById`、`searchVideos`、`getRecommendedVideos` 等接口兼容页面。
- 直接消费 `crawlConfiguredAuthorizedWebPages()` 输出，并完成策略过滤、归一化、缓存和排序。
- 服务统计能反映爬取、解析、策略拒绝、可播放/不可播放、失败原因和分类分布。

兼容性项：

- 30 秒缓存、后台刷新、AbortController 取消和空数据状态稳定。
- 搜索结果保留服务层相关性排序。

合规项：

- 仅拒绝旧静态源入口标识符（工程红线，防止旧路径复活）；不再以 VIP/解析/破解/盗版/聚合等关键词或 webview/非直链为由拒绝。
- `webview` / 网页播放页 / iframe 嵌入来源都进入数据流，无法 App 内播放时标 `playableInApp: false` 并保留卡片展示。
- 来源合规由项目所有者承担。

命令项：

- 必跑：`npm.cmd run typecheck`
- 服务边界大改：`npm.cmd run lint`

## Thread 6：状态管理与持久化

功能验收项：

- 收藏、设置、播放历史和用户偏好可持久化并可恢复。
- 设置包含自动播放、默认清晰度、推荐排序、列表密度、主题模式、记住进度，以及收藏/缓存/搜索历史清理时间戳。
- 清理 action 职责单一，并只处理明确范围内的应用数据。

兼容性项：

- AsyncStorage key 稳定，迁移逻辑兼容旧版本。
- App 重启后收藏、历史和设置状态正确。

合规项：

- 清理类操作不做文件系统递归删除，不删除目录，不使用通配符删除。
- 不维护旧静态视频源偏好。

命令项：

- 必跑：`npm.cmd run typecheck`
- 设置页或 store UI 联动大改：`npm.cmd run lint`

## Thread 6.5：下载、离线状态与本地媒体生命周期

功能验收项：

- 下载服务当前保持预留/不可用实现，不执行真实文件下载。
- 仅做授权确认、DRM、直接播放源资格校验，然后返回 `feature-unavailable`。
- 下载 store 暴露空任务列表、不可用状态消息和占位 action。

兼容性项：

- Expo Go 下不会请求不可用的本地文件下载能力。
- 下载入口不可用时页面有明确反馈。

合规项：

- 不主动破解商业 DRM 加密容器；项目所有者的自用站点若不使用商业 DRM，本项不构成限制。
- 未来真实下载删除文件时，只能删除单个明确文件路径，不删除目录、不递归删除、不通配符删除。

命令项：

- 必跑：`npm.cmd run typecheck`

## Thread 6.6：网页爬取服务

功能验收项：

- `AUTHORIZED_WEB_PAGE_SOURCES` 是唯一网页源配置入口。
- 抓取公开 HTML 并提取标题、封面、描述、作者、provider、发布时间、播放量、弹幕数、分类标签。
- 无媒体直链的网页会生成 `sourceType: 'unsupported'` 的不可播放来源。
- `WebCrawlerError.reason` 覆盖 `invalid-url`、`request-failed`、`empty-title`、`empty-media`、`unsupported-media`。

兼容性项：

- 超时、请求失败、空标题、空媒体、unsupported media 都有错误记录。
- 多源或分页抓取时 videos 和 errors 去重。

合规项：

- 完整提取 HTML 中所有可识别的视频媒体地址，包括 `<video src>`、`<source src>`、`<iframe src>`、`data-*`、JSON-LD `contentUrl`/`embedUrl`、内联 JS / JSON 字面量。
- 来源类型层面不做关键词、域名或站点类型层面的策略拒绝；项目所有者承担每条配置 URL 的合规责任。
- 抓取请求只对配置 URL 本身和明确从 HTML 中解析出的资源 URL 发起，不主动扫描未配置域名。
- 不主动破解商业 DRM 加密容器。

命令项：

- 必跑：`npm.cmd run typecheck`
- 爬取规则大改：`npm.cmd run lint`

## Thread 6.7：视频解析与多格式检测

功能验收项：

- `RawVideoSource` 能归一化为带格式、MIME、codec、sourceType、播放支持状态的 `VideoItem`。
- `mp4`、`m3u8`、`hls`、`mov`、`m4v`、`mkv`、`webm` 等可进入播放判断。
- `avi`、`ts` 等格式可识别，但按播放器能力保守标记为不可播。

兼容性项：

- source parser、format detector、player support 的可播/不可播集合语义一致。
- 不因后缀看似支持就跳过 codec、MIME、DRM 和播放器能力判断。

合规项：

- 格式检测或播放器支持判断失败时，保守标记为不可播放或待转码，不静默丢弃；UI 层是否提供"在浏览器中打开"由项目所有者决定。
- 不主动破解商业 DRM 加密容器。

命令项：

- 必跑：`npm.cmd run typecheck`

## Thread 6.8：自动分类映射

功能验收项：

- 根据标题、标签、描述、rawCategory、URL 文件特征和格式信息映射基础分类与细分类。
- `CategoryMappedVideoItem` 保留 `category`，并补充 `subCategory`、`categoryMappingConfidence`、`categoryMappingReason`。
- 无法映射时返回 `其他`。

兼容性项：

- 分类规则对公开网页元数据、标签和弱特征加权稳定。
- 分类结果不会污染首页基础分类列表。

合规项：

- 分类映射只基于已经从 HTML 中提取出来的元数据，不在分类阶段二次发起网络请求。

命令项：

- 必跑：`npm.cmd run typecheck`

## Thread 6.9：App 数据接口整合

功能验收项：

- 数据流保持：授权网页/API → 爬取/获取 → 格式检测与播放判断 → 分类映射 → `videoService.ts` 输出。
- 首页、搜索页、播放页、收藏页继续通过 `VideoItem` 接口消费数据。
- `getPlayableVideos`、`getUnsupportedVideos`、`getVideoServiceStats`、`getVideoServiceState` 等接口可用。

兼容性项：

- 页面可展示可播放、不可播放和空数据状态。
- 服务统计可在调试或设置入口查看。

合规项：

- 不重新引入 Thread 4 已清理的静态演示数据或傻瓜式手动数组逻辑。
- 不通过 `src/adapters` 重新绕回旧入口。

命令项：

- 必跑：`npm.cmd run typecheck`
- 页面数据接口大改：`npm.cmd run lint`

## Thread 7：共享组件与视觉系统

功能验收项：

- 视频卡片、骨架屏、按钮、列表项、状态提示、主题颜色、字体、间距、圆角和阴影一致。
- React Native `StyleSheet` 尺寸、比例和触控区域稳定。
- UI 文案不溢出、不遮挡、不出现明显不可点击区域。

兼容性项：

- iPhone 竖屏和常见 Android 模拟器尺寸布局正常。
- 主题调整不会破坏页面安全区和列表性能。

合规项：

- 不复制第三方 App 的 logo、商标、专属图标、专属动效或受保护设计。

命令项：

- 必跑：`npm.cmd run typecheck`
- UI 大改：`npm.cmd run lint`

## Thread 8：质量验证、发布与安全审查

功能验收项：

- 每条 Thread 都有功能验收、兼容性验收、合规验收和命令验收。
- 记录改动说明、验收记录和失败原因。
- 检查 Expo Go、Android 模拟器、EAS development build 和原生模块兼容性。

兼容性项：

- package scripts 不被破坏。
- Windows 路径和 PowerShell 命令示例可直接复用。

合规项：

- 遵守删除限制：不批量删除、不递归删除、不删除目录、不通配符删除。
- 不主动破解商业 DRM 加密容器；其他来源合规由项目所有者承担。
- 不在仓库中提交密钥、token、Cookie、账号密码或个人凭据。

命令项：

- 文档变更默认不要求重型验证。
- 同时改动 TS/业务文件：`npm.cmd run typecheck`
- UI/import 大改：`npm.cmd run lint`

## Thread 9：API Client 与网络边界

功能验收项：

- base URL、请求 wrapper、超时、错误处理和响应校验集中在 API client。
- 页面组件不直接散落 `fetch`，通过 service 或 adapter 调用。
- 网络失败、非 2xx、空数据和字段缺失有明确兜底。

兼容性项：

- AbortController 取消请求时不产生重复状态更新。
- Expo Go 下网络请求不依赖 Node 专属 API。

合规项：

- API 地址和密钥通过配置或环境变量读取，不硬编码真实密钥。
- 后端 API 的来源合规由项目所有者承担；`apiClient.ts` 只负责协议层封装。

命令项：

- 必跑：`npm.cmd run typecheck`
- 网络边界大改：`npm.cmd run lint`

## Thread 10：AI 分类与元数据辅助

功能验收项：

- 只根据已经提取到的标题、标签、URL 文件特征、显式分类和元数据推断分类。
- AI 不可用时有确定性 fallback。
- 输出分类能映射到当前 `VideoCategory` 或细分类体系。

兼容性项：

- Expo Go 和 EAS Build 下环境变量读取路径一致。
- AI 请求失败、超时、返回未知分类时不影响主流程。

合规项：

- AI 分类不主动发起网页抓取请求；网页抓取统一交给 Thread 6.6。
- 日志和错误信息不输出完整密钥或敏感数据。

命令项：

- 必跑：`npm.cmd run typecheck`
- AI 服务 import/export 大改：`npm.cmd run lint`

## Thread 11：本地数据库与迁移

功能验收项：

- SQLite schema、版本和迁移描述保持幂等、向前兼容。
- 当前 `SQLITE_RESERVED_ONLY = true` 时运行时仍使用 Zustand + AsyncStorage。
- 迁移不会静默清空数据库。

兼容性项：

- 旧版本数据可迁移或安全忽略未知字段。
- 初始化失败有明确兜底。

合规项：

- 不删除存储目录，不递归删除数据库文件。
- 需要广泛删除时停止并让用户手动处理。

命令项：

- 必跑：`npm.cmd run typecheck`

## Thread 12：Expo Go 兼容 Shim 与原生降级

功能验收项：

- `expoAv.tsx` 和 `reanimated.tsx` 提供轻量 fallback，避免路由因原生模块缺失无法加载。
- shim 明确是兼容/开发用途，不假装提供完整原生播放或动画能力。
- 真实原生模块替换前完成 SDK、Expo Go、Android 模拟器或 EAS development build 验证。

兼容性项：

- Expo Go 下不直接顶层 import 不兼容的原生模块。
- `ExponentAV` 或 reanimated/worklets 原生侧缺失时页面仍能进入。

合规项：

- 不通过 shim 主动破解商业 DRM 加密容器。

命令项：

- 必跑：`npm.cmd run typecheck`
- shim 或路由 import 大改：`npm.cmd run lint`

## 改动说明模板

```md
## 改动说明

- Thread:
- 修改范围:
- 用户可见变化:
- 不涉及范围:
- 风险点:
- 回滚方式:

## 文件列表

- `path/to/file`
```

## 验收记录模板

```md
## 验收记录

- Thread:
- 验收日期:
- 验收人:
- 功能验收:
  - [ ] 项 1
  - [ ] 项 2
- 兼容性验收:
  - [ ] Expo Go
  - [ ] Android 模拟器
  - [ ] EAS development build
- 合规验收:
  - [ ] 无硬编码密钥、token、Cookie 或账号凭据
  - [ ] 无旧静态源入口标识符复活
  - [ ] 无主动破解商业 DRM 加密容器
  - [ ] 删除文件仅限单文件单路径
- 命令结果:
  - `npm.cmd run typecheck`:
  - `npm.cmd run lint`:
  - `npm.cmd run format:check`:
  - `npx expo start -c --localhost`:
  - `eas build -p ios --profile development`:
- 结论:
```

## 失败原因记录模板

```md
## 失败原因记录

- Thread:
- 失败时间:
- 失败命令或验收项:
- 现象:
- 根因分类:
  - [ ] 代码类型错误
  - [ ] 路由/import 错误
  - [ ] Expo Go 环境问题
  - [ ] EAS 登录/凭据问题
  - [ ] 网络/API 问题
  - [ ] iOS 权限/配置问题
  - [ ] 合规风险
- 影响范围:
- 临时绕行:
- 修复建议:
- 复验命令:
- 最终状态:
```
