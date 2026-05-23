# Architecture Guardrails

This app is an aggregated video app. It is not a single-source player. The app should stay thin at the route layer, keep product rules testable in domain modules, and keep backend/provider boundaries explicit.

## Directory Layers

### `app`

Expo Router entry points only.

Route files should compose feature containers, read route params, wire navigation, and render loading/error/empty states. They should not own crawler logic, cache policy, ranking policy, API normalization, or player engine selection.

### `features`

Page-level feature modules, for example:

- `features/home`
- `features/player`
- `features/search`
- `features/video-detail`

Feature modules can contain screen containers, view models, hooks, and UI orchestration for one user workflow. They may call `data`, `domain`, and `infra`, but should not implement core ranking, API contracts, storage engines, or video player engines inline.

### `domain`

Pure business rules.

Examples:

- video aggregation model
- recommendation policy
- ranking
- category recognition
- playback domain decisions

`domain` must be portable TypeScript. It must not depend on React, Expo, AsyncStorage, `fetch`, React Native modules, or platform globals.

### `data`

API, cache, provider, repository, and data coordination.

Examples:

- backend API providers
- local crawler provider fallback wrappers
- repositories
- cache hydration/persistence coordinators
- episode resolve coordinator

`data` may depend on `domain` and `infra`. It owns data source selection and normalization, but product ranking rules should stay in `domain`.

### `infra`

Platform and integration adapters.

Examples:

- env reader
- fetch client
- storage adapter
- logger
- player engine selector
- native media adapter

Pages must not import native video engines directly. They should go through `infra/player/playerEngineSelector`.

### `services`

Compatibility facades for old imports.

`services` exists to keep current pages stable while code is moved into `features`, `domain`, `data`, and `infra`. New business logic should not be added to `services`. Facade files should trend smaller over time.

## Dependency Rules

Allowed direction:

```text
app -> features
features -> domain / data / infra
data -> domain / infra
infra -> platform libraries
services -> domain / data / infra
```

Rules:

- `app` should only be route entry and composition.
- `features` may orchestrate UI workflows, but must not contain crawler, ranking, cache, or player engine internals.
- `data` may call backend APIs, providers, cache, storage, and normalizers.
- `domain` cannot import React, Expo, AsyncStorage, `fetch`, `react-native`, or platform adapters.
- `services` must remain facade-only. If a service grows business logic, move it into `domain`, `data`, or `infra`.
- Avoid circular dependencies. When two modules need each other, extract a smaller domain type or infra adapter.

## Product Strategy

### Backend First

The production path is backend first:

1. App calls the backend API.
2. Backend handles crawler, aggregation, dedupe, health checks, and resolve.
3. App displays, searches, stores favorites/history, plays, switches lines, and handles failure fallback.

Local crawler code is fallback only. It is for authorized sources, development debugging, or backend outage fallback. Production must not silently run heavy local crawling unless explicitly enabled by configuration.

### Content Preference

The app intentionally prefers TV dramas, especially Korean dramas. This is product strategy, not a bug.

The preference must stay centralized in recommendation policy:

- `src/domain/recommendation/contentPreferencePolicy.ts`
- `src/domain/recommendation/rankVideos.ts`

Do not scatter Korean drama or TV drama boost logic in crawlers, home, search, detail pages, or player recommendations. Classification answers "what is this content"; recommendation policy answers "how should this be ranked".

### Player Engine

Pages must not directly import `expo-av`, `expo-video`, `react-native-video`, or platform video shims. Player selection must go through:

- `src/infra/player/playerEngineSelector.ts`

Direct media URLs such as `mp4`, `m3u8`, and HLS should prefer the native player path selected there. Page URLs, iframe URLs, or unresolved play pages must first go through backend resolve or the allowed fallback resolver before playback.

### WebView Fallback

WebView fallback is an infra/player concern, never a page-level shortcut.

If product policy enables WebView fallback in the future, it may only be used for normal page playback fallback. It must not inject scripts to bypass access controls, crack encrypted streams, avoid DRM, scrape unauthorized media, download media, or work around authorization. Current product policy may disable opening web pages entirely; in that mode unresolved web pages should show a friendly unavailable state instead of opening a WebView.

### DRM And Authorization

Do not implement DRM bypass, decryption bypass, cookie theft, hidden download logic, or authorization circumvention. DRM/encrypted/no-authorization sources should be treated as blocked or unplayable.

## Size Guardrails

Run:

```bash
npm run check:all
```

The size guard reports files that are drifting toward unmaintainable size and fails for newly added files over 800 lines. It also fails when a changed, non-allowlisted file crosses its layer threshold, so refactors cannot quietly move a large page or service problem into a new file. Historical large files are temporarily allowlisted in `scripts/check-file-size.js` with TODO split targets; `backendApiService.ts` is one of those temporary exceptions and should be split into a `data/api` backend client plus a backend DTO normalizer.
