import { mapVideoItemsToAppCategories } from '@/services/categoryMappingService';
import {
  APP_VIDEO_CATEGORIES,
  inferVideoCategory,
  mapCategoryToAppCategory,
} from '@/services/categoryService';
import {
  fetchBackendVideoById,
  fetchBackendVideos,
  isBackendApiConfigured,
  resolveBackendEpisodeMedia,
  searchBackendVideos,
} from '@/services/backendApiService';
import {
  applyEpisodeMediaPatches,
  type EpisodeMediaPatch,
} from '@/services/videoEpisodePatchService';
import {
  clearPersistedVideos,
  loadPersistedVideoCache,
  savePersistedVideos,
} from '@/services/videoCacheStorage';
import { normalizeVideoFormatSource } from '@/services/videoFormatService';
import {
  clearDiscoveredWebPages,
  crawlConfiguredAuthorizedWebPages,
  fetchEpisodeMediaUrl,
  probeMediaUrlReachable,
} from '@/services/webCrawlerService';
import type { WebCrawlerSourceRuntimeOverrides } from '@/services/webCrawlerService';
import { usePlayHistoryStore } from '@/store/playHistoryStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { RawVideoSource, VideoCategory, VideoItem, VideoPlayLine } from '@/types/video';

export type VideoServiceContext = {
  bypassCache?: boolean;
  favoriteCategories?: (VideoCategory | string)[];
  favoriteVideoIds?: string[];
  preferredCategories?: (VideoCategory | string)[];
  signal?: AbortSignal;
};

export type VideoServiceStatus =
  | 'idle'
  | 'ok'
  | 'empty'
  | 'crawl_failed'
  | 'parse_failed'
  | 'partial';

export type VideoServiceErrorCode =
  | 'EMPTY_RESULT'
  | 'CRAWL_FAILED'
  | 'PARSE_FAILED'
  | 'POLICY_REJECTED';

export type VideoPipelineIssue = {
  code: VideoServiceErrorCode;
  message: string;
  sourceId?: string;
  status?: number;
  url?: string;
};

export type VideoPipelineStats = {
  categoryDistribution: Record<string, number>;
  crawlTotal: number;
  crawlFailed: number;
  durationMs: number;
  failureReasonDistribution: Record<string, number>;
  parseFailed: number;
  policyRejected: number;
  playable: number;
  rawTotal: number;
  total: number;
  unsupported: number;
  updatedAt?: string;
};

export type VideoServiceCacheState = {
  expiresAt?: string;
  hasCache: boolean;
  isStale: boolean;
  itemCount: number;
  ttlMs: number;
};

export type VideoServiceState = {
  cache: VideoServiceCacheState;
  errors: VideoPipelineIssue[];
  isRefreshing: boolean;
  lastUpdatedAt?: string;
  stats: VideoPipelineStats;
  status: VideoServiceStatus;
};

type VideoPipelineResult = {
  errors: VideoPipelineIssue[];
  items: VideoItem[];
  source?: 'backend' | 'crawler';
  stats: VideoPipelineStats;
  status: VideoServiceStatus;
};

type VideoCache = VideoPipelineResult & {
  expiresAt: number;
};

const VIDEO_CACHE_TTL_MS = 300_000;
const VIDEO_PIPELINE_TIMEOUT_MS = 90_000;
const VIDEO_PIPELINE_INITIAL_MAX_VIDEOS = 200;
const VIDEO_PIPELINE_BACKGROUND_MAX_VIDEOS = 1_400;
const VIDEO_BACKGROUND_PIPELINE_TIMEOUT_MS = 600_000;
const BACKGROUND_DEEP_CRAWL_DELAY_MS = 8_000;
const BACKGROUND_DEEP_CRAWL_RECOVERY_DELAY_MS = 30_000;
const BACKGROUND_REFRESH_MIN_INTERVAL_MS = 180_000;
const RECOVERY_CACHE_THRESHOLD = 50;
const REFRESH_MIN_INTERVAL_MS = 15_000;
const LINE_HEAD_WARMUP_DELAY_MS = 4_000;
const LINE_HEAD_WARMUP_INTERVAL_MS = 200;
const LINE_HEAD_WARMUP_TIMEOUT_MS = 12_000;
const LINE_HEAD_WARMUP_MAX_EPISODES = 200;
const LINE_HEAD_WARMUP_MAX_LINES_PER_VIDEO = 1;
const LINE_HEAD_WARMUP_CONCURRENCY = 4;
const MEDIA_PROBE_TIMEOUT_MS = 12_000;
const LINE_HEAD_WARMUP_FLUSH_SIZE = 4;
const LINE_HEAD_WARMUP_FLUSH_INTERVAL_MS = 2_000;
const FOREGROUND_SOURCE_OVERRIDES: WebCrawlerSourceRuntimeOverrides = {
  crawlIntervalMs: 150,
  discoverNavigationAfterEnoughVideos: false,
  frontierSeedLimit: 0,
  maxChildrenPerPage: 60,
  maxConcurrency: 3,
  maxDetailPages: 1_200,
  maxNavigationPageNumber: 60,
  maxNavigationPages: 180,
  maxVideos: 200,
  timeoutMs: 15_000,
};
const BACKGROUND_SOURCE_OVERRIDES: WebCrawlerSourceRuntimeOverrides = {
  crawlIntervalMs: 220,
  discoverNavigationAfterEnoughVideos: true,
  frontierSeedLimit: 1_400,
  maxChildrenPerPage: 120,
  maxConcurrency: 3,
  maxDetailPages: 4_000,
  maxNavigationPageNumber: 600,
  maxNavigationPages: 1_500,
  maxVideos: 1_800,
  timeoutMs: 15_000,
};
const playableSortBoost = 1_000_000_000;
const KOREAN_DRAMA_BOOST = 12_000_000;
const TV_DRAMA_BOOST = 6_000_000;
const KOREAN_DRAMA_KEYWORDS = [
  '\u97e9\u5267',
  '\u97e9\u56fd\u5267',
  '\u97e9\u56fd\u7535\u89c6\u5267',
  'korean drama',
  'k-drama',
  'kdrama',
  'korean series',
];
const TV_DRAMA_CATEGORY: VideoCategory = '\u7535\u89c6\u5267';

const categoryPriorityFor = (video: VideoItem): number => {
  const values = [video.category, video.subCategory, video.rawCategory]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  const normalized = values.join(' ');

  if (KOREAN_DRAMA_KEYWORDS.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return KOREAN_DRAMA_BOOST;
  }

  if (video.category === TV_DRAMA_CATEGORY) {
    return TV_DRAMA_BOOST;
  }

  return 0;
};
const defaultCacheState: VideoServiceCacheState = {
  hasCache: false,
  isStale: false,
  itemCount: 0,
  ttlMs: VIDEO_CACHE_TTL_MS,
};
const defaultStats: VideoPipelineStats = {
  categoryDistribution: {},
  crawlTotal: 0,
  crawlFailed: 0,
  durationMs: 0,
  failureReasonDistribution: {},
  parseFailed: 0,
  policyRejected: 0,
  playable: 0,
  rawTotal: 0,
  total: 0,
  unsupported: 0,
};

let cachedVideos: VideoCache | undefined;
let cacheVersion = 0;
let refreshPromise: Promise<VideoPipelineResult> | undefined;
let backgroundRefreshPromise: Promise<VideoPipelineResult | undefined> | undefined;
let backgroundRefreshTimer: ReturnType<typeof setTimeout> | undefined;
let backgroundCrawlController: AbortController | undefined;
let lineHeadWarmupTimer: ReturnType<typeof setTimeout> | undefined;
let lineHeadWarmupController: AbortController | undefined;
let lineHeadWarmupPromise: Promise<void> | undefined;
let lastRefreshAttemptAt = 0;
let lastBackgroundRefreshAttemptAt = 0;
let serviceState: VideoServiceState = {
  cache: defaultCacheState,
  errors: [],
  isRefreshing: false,
  stats: defaultStats,
  status: 'idle',
};

type VideoSubscriber = (videos: VideoItem[], meta?: { version: number }) => void;

const videoSubscribers = new Set<VideoSubscriber>();

const countEpisodesOnItem = (video: VideoItem) =>
  (video.playLines ?? []).reduce((sum, line) => sum + line.episodes.length, 0);

const countResolvedEpisodesOnItem = (video: VideoItem) =>
  (video.playLines ?? []).reduce(
    (sum, line) => sum + line.episodes.filter((episode) => Boolean(episode.mediaUrl)).length,
    0,
  );

const computeCacheQuality = (items: VideoItem[]) => {
  const withPlayLines = items.filter((video) => (video.playLines?.length ?? 0) > 0).length;
  const episodeTotal = items.reduce((sum, video) => sum + countEpisodesOnItem(video), 0);
  const resolvedEpisodeTotal = items.reduce(
    (sum, video) => sum + countResolvedEpisodesOnItem(video),
    0,
  );
  const playableTotal = items.filter((video) => video.playableInApp).length;
  const score =
    withPlayLines * 10_000 +
    episodeTotal * 100 +
    resolvedEpisodeTotal * 20 +
    playableTotal * 5 +
    items.length;

  return {
    episodeTotal,
    itemTotal: items.length,
    playableTotal,
    resolvedEpisodeTotal,
    score,
    withPlayLines,
  };
};

const isCacheQualityAtLeast = (currentItems: VideoItem[], nextItems: VideoItem[]) => {
  const currentQuality = computeCacheQuality(currentItems);
  const nextQuality = computeCacheQuality(nextItems);

  return (
    currentQuality.score >= nextQuality.score && currentQuality.itemTotal >= nextQuality.itemTotal
  );
};

const isCandidateCacheBetter = (candidateItems: VideoItem[], currentItems: VideoItem[]) => {
  if (candidateItems.length === 0) {
    return false;
  }

  if (currentItems.length === 0) {
    return true;
  }

  const candidateQuality = computeCacheQuality(candidateItems);
  const currentQuality = computeCacheQuality(currentItems);

  if (candidateQuality.score > currentQuality.score) {
    return true;
  }

  if (
    candidateQuality.score === currentQuality.score &&
    candidateQuality.itemTotal > currentQuality.itemTotal
  ) {
    return true;
  }

  return (
    candidateQuality.withPlayLines > currentQuality.withPlayLines ||
    candidateQuality.episodeTotal > currentQuality.episodeTotal ||
    candidateQuality.resolvedEpisodeTotal > currentQuality.resolvedEpisodeTotal
  );
};

const isIncompleteCache = (items: VideoItem[]) => {
  if (items.length === 0) {
    return true;
  }

  const quality = computeCacheQuality(items);
  const minimumPlayLineCards = Math.min(8, Math.ceil(items.length * 0.2));

  return quality.withPlayLines < minimumPlayLineCards || quality.episodeTotal === 0;
};

const shouldBypassRefreshThrottleForCache = (cache?: VideoCache) =>
  Boolean(cache && (cache.status !== 'ok' || isIncompleteCache(cache.items)));

const hasBackoffLikeIssue = (result: VideoPipelineResult) =>
  result.errors.some((issue) => /backoff|403|429|503|rate limit|too many/i.test(issue.message));

const shouldResetRefreshThrottleAfterResult = (result: VideoPipelineResult) =>
  shouldThrowResult(result) || hasBackoffLikeIssue(result);

const mergeEpisodeMediaUrlsIntoLines = (
  nextLines: VideoPlayLine[] | undefined,
  previousLines: VideoPlayLine[] | undefined,
): VideoPlayLine[] | undefined => {
  if (!nextLines || nextLines.length === 0) {
    return previousLines;
  }

  if (!previousLines || previousLines.length === 0) {
    return nextLines;
  }

  const previousByLine = new Map<number, VideoPlayLine>();

  for (const line of previousLines) {
    previousByLine.set(line.line, line);
  }

  return nextLines.map((line) => {
    const prevLine = previousByLine.get(line.line);

    if (!prevLine) {
      return line;
    }

    const prevByEpisode = new Map<number, VideoPlayLine['episodes'][number]>();

    for (const episode of prevLine.episodes) {
      prevByEpisode.set(episode.episode, episode);
    }

    return {
      ...line,
      episodes: line.episodes.map((episode) => {
        const prevEpisode = prevByEpisode.get(episode.episode);

        if (!episode.mediaUrl && prevEpisode?.mediaUrl) {
          return {
            ...episode,
            mediaUrl: prevEpisode.mediaUrl,
            format: episode.format ?? prevEpisode.format,
            sourceType: episode.sourceType ?? prevEpisode.sourceType,
          };
        }

        return episode;
      }),
    };
  });
};

const mergePreservingEpisodeProgress = (
  nextItems: VideoItem[],
  previousItems: VideoItem[],
): VideoItem[] => {
  if (previousItems.length === 0) {
    return nextItems;
  }

  const previousById = new Map<string, VideoItem>();
  const previousBySeriesId = new Map<string, VideoItem>();

  for (const item of previousItems) {
    previousById.set(item.id, item);

    if (item.seriesId) {
      previousBySeriesId.set(item.seriesId, item);
    }
  }

  return nextItems.map((nextItem) => {
    const prevItem =
      previousById.get(nextItem.id) ??
      (nextItem.seriesId ? previousBySeriesId.get(nextItem.seriesId) : undefined);

    if (!prevItem) {
      return nextItem;
    }

    const mergedLines = mergeEpisodeMediaUrlsIntoLines(nextItem.playLines, prevItem.playLines);
    const hadMoreEpisodes = countEpisodesOnItem(prevItem) > countEpisodesOnItem(nextItem);
    const finalLines = hadMoreEpisodes ? prevItem.playLines : mergedLines;
    const firstPlayableEpisode = (finalLines ?? [])
      .flatMap((line) => line.episodes)
      .find((episode) => Boolean(episode.mediaUrl));

    return {
      ...nextItem,
      playLines: finalLines,
      source: firstPlayableEpisode?.mediaUrl ?? nextItem.source ?? prevItem.source,
      format: firstPlayableEpisode?.format ?? nextItem.format ?? prevItem.format,
      sourceType: firstPlayableEpisode?.sourceType ?? nextItem.sourceType ?? prevItem.sourceType,
      playableInApp: Boolean(firstPlayableEpisode) || nextItem.playableInApp,
      unsupportedReason:
        firstPlayableEpisode || nextItem.playableInApp
          ? undefined
          : (nextItem.unsupportedReason ?? prevItem.unsupportedReason),
    };
  });
};

const emitVideos = (videos: VideoItem[]) => {
  cacheVersion += 1;
  const meta = { version: cacheVersion };

  for (const subscriber of videoSubscribers) {
    try {
      subscriber(videos, meta);
    } catch (error) {
      console.warn(
        '[videoService] subscriber threw',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
};

export const subscribeVideos = (callback: VideoSubscriber): (() => void) => {
  videoSubscribers.add(callback);

  if (cachedVideos) {
    try {
      callback(cachedVideos.items, { version: cacheVersion });
    } catch (error) {
      console.warn(
        '[videoService] initial subscriber threw',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return () => {
    videoSubscribers.delete(callback);
  };
};

export const getVideoCacheVersion = () => cacheVersion;

export type UpdateEpisodeMediaPayload = EpisodeMediaPatch;

export type ResolveEpisodeMediaPayload = {
  episode: number;
  line: number;
  playPageUrl: string;
  videoId: string;
};

export type ResolvedEpisodeMedia = {
  format?: RawVideoSource['format'];
  mediaUrl: string;
  sourceType?: RawVideoSource['sourceType'];
};

const updateEpisodeMediaUrls = (payloads: UpdateEpisodeMediaPayload[]): VideoItem[] => {
  if (!cachedVideos) {
    return [];
  }

  const result = applyEpisodeMediaPatches(cachedVideos.items, payloads);

  if (!result.changed) {
    return [];
  }

  cachedVideos = {
    ...cachedVideos,
    items: result.items,
    expiresAt: Date.now() + VIDEO_CACHE_TTL_MS,
  };

  emitVideos(result.items);
  void savePersistedVideos(result.items);

  return result.updatedItems;
};

export const updateEpisodeMediaUrl = (
  payload: UpdateEpisodeMediaPayload,
): VideoItem | undefined => {
  const [updatedItem] = updateEpisodeMediaUrls([payload]);

  return updatedItem;
};

export const resolveEpisodeMediaUrl = async (
  payload: ResolveEpisodeMediaPayload,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<ResolvedEpisodeMedia> => {
  if (isBackendApiConfigured()) {
    try {
      const backendResult = await resolveBackendEpisodeMedia(payload, options);

      if (backendResult.reachable === false) {
        throw new Error('Backend resolved media is not reachable.');
      }

      return {
        format: backendResult.format,
        mediaUrl: backendResult.mediaUrl,
        sourceType: backendResult.sourceType,
      };
    } catch (error) {
      console.warn(
        '[videoService] backend episode resolve failed, falling back to local resolver',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const result = await fetchEpisodeMediaUrl(payload.playPageUrl, {
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
  });

  if (!result.mediaUrl) {
    throw new Error('Episode media URL is empty.');
  }

  const probe = await probeMediaUrlReachable(result.mediaUrl, {
    signal: options?.signal,
    timeoutMs: options?.timeoutMs ?? MEDIA_PROBE_TIMEOUT_MS,
  });

  if (!probe.reachable) {
    throw new Error('Episode media URL is not reachable.');
  }

  return {
    format: result.format,
    mediaUrl: result.mediaUrl,
    sourceType: result.sourceType,
  };
};

export const removeVideosByIds = (videoIds: string[]): number => {
  if (!cachedVideos || videoIds.length === 0) {
    return 0;
  }

  const removeSet = new Set(videoIds);
  const previousCount = cachedVideos.items.length;
  const remaining = cachedVideos.items.filter((video) => !removeSet.has(video.id));
  const removedCount = previousCount - remaining.length;

  if (removedCount === 0) {
    return 0;
  }

  cachedVideos = {
    ...cachedVideos,
    items: remaining,
    stats: buildStats(remaining, cachedVideos.stats.durationMs, cachedVideos.stats.rawTotal, []),
  };

  serviceState = {
    ...serviceState,
    cache: getCacheState(),
    stats: cloneStats(cachedVideos.stats),
  };

  emitVideos(remaining);
  void savePersistedVideos(remaining);

  return removedCount;
};

let hydratePromise: Promise<VideoItem[] | undefined> | undefined;

const getHydratedCacheExpiry = (savedAt: number | undefined) => {
  const baseTime = typeof savedAt === 'number' && Number.isFinite(savedAt) ? savedAt : Date.now();

  return baseTime + VIDEO_CACHE_TTL_MS;
};

export const hydrateFromPersistedCache = (): Promise<VideoItem[] | undefined> => {
  if (cachedVideos) {
    return Promise.resolve(cachedVideos.items);
  }

  if (!hydratePromise) {
    hydratePromise = loadPersistedVideoCache()
      .then((snapshot) => {
        const items = snapshot?.items;
        if (!items || items.length === 0) {
          return undefined;
        }

        if (cachedVideos) {
          return cachedVideos.items;
        }

        const stats = buildStats(items, 0, items.length, []);
        cachedVideos = {
          errors: [],
          items,
          stats,
          status: 'partial',
          expiresAt: getHydratedCacheExpiry(snapshot?.savedAt),
        };
        serviceState = toServiceState({ errors: [], items, stats, status: 'partial' }, false);
        emitVideos(items);

        return items;
      })
      .catch((error) => {
        console.warn(
          '[videoService] hydrate failed',
          error instanceof Error ? error.message : String(error),
        );
        return undefined;
      });
  }

  return hydratePromise;
};

export class VideoServiceError extends Error {
  code: VideoServiceErrorCode;
  issues: VideoPipelineIssue[];
  stats: VideoPipelineStats;

  constructor(code: VideoServiceErrorCode, message: string, result: VideoPipelineResult) {
    super(message);
    this.name = 'VideoServiceError';
    this.code = code;
    this.issues = result.errors;
    this.stats = result.stats;
  }
}

const getCacheState = (): VideoServiceCacheState => {
  if (!cachedVideos) {
    return defaultCacheState;
  }

  return {
    expiresAt: new Date(cachedVideos.expiresAt).toISOString(),
    hasCache: true,
    isStale: cachedVideos.expiresAt <= Date.now(),
    itemCount: cachedVideos.items.length,
    ttlMs: VIDEO_CACHE_TTL_MS,
  };
};

const cloneStats = (stats: VideoPipelineStats): VideoPipelineStats => ({
  ...stats,
  categoryDistribution: { ...stats.categoryDistribution },
  failureReasonDistribution: { ...stats.failureReasonDistribution },
});

const toServiceState = (result: VideoPipelineResult, isRefreshing = false): VideoServiceState => ({
  cache: getCacheState(),
  errors: result.errors,
  isRefreshing,
  lastUpdatedAt: result.stats.updatedAt,
  stats: cloneStats(result.stats),
  status: result.status,
});

const markRefreshing = (isRefreshing: boolean) => {
  serviceState = {
    ...serviceState,
    cache: getCacheState(),
    isRefreshing,
  };
};

const addFailureReason = (distribution: Record<string, number>, reason?: string) => {
  const key = reason?.trim() || 'Unknown failure';
  distribution[key] = (distribution[key] ?? 0) + 1;
};

const createTimeoutSignal = (timeoutMs: number): { cleanup: () => void; signal: AbortSignal } => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    cleanup: () => clearTimeout(timeoutId),
    signal: controller.signal,
  };
};

const ingestionSource = 'crawler-pipeline' as const;
const legacyStaticSourcePattern =
  /demoVideos|videoSources|USER_VIDEO_SOURCES|USER_REMOTE_API_ENDPOINTS|USER_CUSTOM_VIDEO_SOURCES|legacy-/i;

const getPolicyRejectionReason = (rawSource: RawVideoSource): string | undefined => {
  const searchableText = [
    rawSource.id,
    rawSource.title,
    rawSource.source,
    rawSource.provider,
    rawSource.webViewUrl,
    rawSource.videoUrl,
    ...(rawSource.tags ?? []),
  ]
    .filter(Boolean)
    .join(' ');

  if (legacyStaticSourcePattern.test(searchableText)) {
    return 'Rejected legacy static/demo video source fallback.';
  }

  return undefined;
};

const markCrawlerIngestion = (video: VideoItem): VideoItem => ({
  ...video,
  ingestionSource,
});

const toTimestamp = (value?: string) => {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getRecencyScore = (value?: string) => {
  const timestamp = toTimestamp(value);

  if (timestamp <= 0) {
    return 0;
  }

  const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000);

  return Math.max(0, 80 - Math.min(ageDays, 80));
};

const getEngagementScore = (video: VideoItem) =>
  (video.playCount ?? 0) + (video.danmakuCount ?? 0) * 2;

const getStableVideoKey = (video: VideoItem) =>
  [video.id, video.source, video.title].filter(Boolean).join('|').toLowerCase();

const compareStableVideoKey = (first: VideoItem, second: VideoItem) =>
  getStableVideoKey(first).localeCompare(getStableVideoKey(second));

const compareByDefaultOrder = (first: VideoItem, second: VideoItem) => {
  const priorityDelta = categoryPriorityFor(second) - categoryPriorityFor(first);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const firstPlayable = first.playableInApp ? playableSortBoost : 0;
  const secondPlayable = second.playableInApp ? playableSortBoost : 0;
  const playableDelta = secondPlayable - firstPlayable;

  if (playableDelta !== 0) {
    return playableDelta;
  }

  const freshnessDelta = toTimestamp(second.createdAt) - toTimestamp(first.createdAt);

  if (freshnessDelta !== 0) {
    return freshnessDelta;
  }

  const engagementDelta = getEngagementScore(second) - getEngagementScore(first);

  if (engagementDelta !== 0) {
    return engagementDelta;
  }

  return compareStableVideoKey(first, second);
};

const sortDefaultVideos = (videos: VideoItem[]) => [...videos].sort(compareByDefaultOrder);

const comparePlayableVideos = (first: VideoItem, second: VideoItem) => {
  const freshnessDelta = toTimestamp(second.createdAt) - toTimestamp(first.createdAt);

  if (freshnessDelta !== 0) {
    return freshnessDelta;
  }

  const engagementDelta = getEngagementScore(second) - getEngagementScore(first);

  if (engagementDelta !== 0) {
    return engagementDelta;
  }

  return compareStableVideoKey(first, second);
};

const compareUnsupportedVideos = (first: VideoItem, second: VideoItem) => {
  const reasonDelta = (first.unsupportedReason ?? '').localeCompare(second.unsupportedReason ?? '');

  if (reasonDelta !== 0) {
    return reasonDelta;
  }

  const categoryDelta = String(first.category).localeCompare(String(second.category));

  if (categoryDelta !== 0) {
    return categoryDelta;
  }

  return compareStableVideoKey(first, second);
};

const getDedupeKeys = (video: VideoItem) =>
  [video.id, video.source].map((value) => value.trim().toLowerCase()).filter(Boolean);

const dedupeVideos = (videos: VideoItem[]): VideoItem[] => {
  const seen = new Set<string>();
  const uniqueVideos: VideoItem[] = [];

  for (const video of videos) {
    const keys = getDedupeKeys(video);
    const hasSeenKey = keys.some((key) => seen.has(key));

    if (hasSeenKey) {
      continue;
    }

    keys.forEach((key) => seen.add(key));
    uniqueVideos.push(video);
  }

  return uniqueVideos;
};

const buildStats = (
  items: VideoItem[],
  durationMs: number,
  rawTotal: number,
  errors: VideoPipelineIssue[],
): VideoPipelineStats => {
  const distribution: Record<string, number> = {};
  const categoryDistribution: Record<string, number> = {};

  for (const video of items) {
    const category = String(video.category || '未分类');
    categoryDistribution[category] = (categoryDistribution[category] ?? 0) + 1;

    if (!video.playableInApp) {
      addFailureReason(distribution, video.unsupportedReason);
    }
  }

  for (const error of errors) {
    addFailureReason(distribution, error.message);
  }

  return {
    categoryDistribution,
    crawlTotal: rawTotal,
    crawlFailed: errors.filter((error) => error.code === 'CRAWL_FAILED').length,
    durationMs,
    failureReasonDistribution: distribution,
    parseFailed: errors.filter((error) => error.code === 'PARSE_FAILED').length,
    policyRejected: errors.filter((error) => error.code === 'POLICY_REJECTED').length,
    playable: items.filter((video) => video.playableInApp).length,
    rawTotal,
    total: items.length,
    unsupported: items.filter((video) => !video.playableInApp).length,
    updatedAt: new Date().toISOString(),
  };
};

const getResultStatus = (items: VideoItem[], errors: VideoPipelineIssue[]): VideoServiceStatus => {
  if (items.length > 0 && errors.length > 0) {
    return 'partial';
  }

  if (items.length > 0) {
    return 'ok';
  }

  if (errors.some((error) => error.code === 'CRAWL_FAILED')) {
    return 'crawl_failed';
  }

  if (errors.some((error) => error.code === 'PARSE_FAILED')) {
    return 'parse_failed';
  }

  return 'empty';
};

const createEmptyResult = (): VideoPipelineResult => {
  const errors: VideoPipelineIssue[] = [
    {
      code: 'EMPTY_RESULT',
      message: 'Authorized crawl completed but returned no videos.',
    },
  ];

  return {
    errors,
    items: [],
    stats: buildStats([], 0, 0, errors),
    status: 'empty',
  };
};

export const normalizeVideoSource = (raw: RawVideoSource): VideoItem =>
  normalizeVideoFormatSource(raw);

const PROGRESS_EMIT_INTERVAL_MS = 1_500;
const PROGRESS_EMIT_MIN_INCREMENT = 16;
const EARLY_COMMIT_THRESHOLD = 4;
const CATEGORY_MAPPING_BATCH_SIZE = 24;

type IdleDeadlineLike = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

type RequestIdleCallbackLike = (
  callback: (deadline: IdleDeadlineLike) => void,
  options?: { timeout?: number },
) => unknown;

const yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve, 16));

const runWhenIdle = (task: () => void, timeoutMs = 1_500) => {
  const requestIdle = (globalThis as { requestIdleCallback?: RequestIdleCallbackLike })
    .requestIdleCallback;

  if (typeof requestIdle === 'function') {
    requestIdle(() => task(), { timeout: timeoutMs });
    return;
  }

  setTimeout(task, 32);
};

const buildLightweightItem = (raw: RawVideoSource): VideoItem | undefined => {
  try {
    const normalized = markCrawlerIngestion(normalizeVideoSource(raw));
    const inferredCategory = inferVideoCategory({
      category: normalized.category,
      rawCategory: normalized.rawCategory,
      title: normalized.title,
      description: normalized.description,
      tags: normalized.tags,
    });

    return {
      ...normalized,
      category: inferredCategory,
    };
  } catch {
    return undefined;
  }
};

const buildPartialItems = (rawSources: RawVideoSource[]): VideoItem[] => {
  const partialItems: VideoItem[] = [];

  for (const rawSource of rawSources) {
    if (getPolicyRejectionReason(rawSource)) {
      continue;
    }

    const item = buildLightweightItem(rawSource);

    if (item) {
      partialItems.push(item);
    }
  }

  return sortDefaultVideos(dedupeVideos(partialItems));
};

const mapVideoItemsToAppCategoriesInBatches = async (videos: VideoItem[]) => {
  const mappedVideos: VideoItem[] = [];

  for (let index = 0; index < videos.length; index += CATEGORY_MAPPING_BATCH_SIZE) {
    mappedVideos.push(
      ...mapVideoItemsToAppCategories(videos.slice(index, index + CATEGORY_MAPPING_BATCH_SIZE)),
    );

    if (index + CATEGORY_MAPPING_BATCH_SIZE < videos.length) {
      await yieldToEventLoop();
    }
  }

  return mappedVideos;
};

const mapCrawlerErrorsToIssues = (
  errors: Awaited<ReturnType<typeof crawlConfiguredAuthorizedWebPages>>['errors'],
): VideoPipelineIssue[] =>
  errors.map((error) => ({
    code: 'CRAWL_FAILED' as const,
    message: error.message,
    status: error.status,
    url: error.url,
  }));

const normalizeRawSourcesToResult = async (
  rawSources: RawVideoSource[],
  initialErrors: VideoPipelineIssue[],
  startedAt: number,
): Promise<VideoPipelineResult> => {
  const errors = [...initialErrors];
  const normalizedVideos: VideoItem[] = [];

  for (let index = 0; index < rawSources.length; index += 1) {
    const rawSource = rawSources[index];

    if (!rawSource) {
      continue;
    }

    const policyRejectionReason = getPolicyRejectionReason(rawSource);

    if (policyRejectionReason) {
      errors.push({
        code: 'POLICY_REJECTED',
        message: policyRejectionReason,
        sourceId: rawSource.id,
      });
      continue;
    }

    try {
      normalizedVideos.push(markCrawlerIngestion(normalizeVideoSource(rawSource)));
    } catch (error) {
      errors.push({
        code: 'PARSE_FAILED',
        message: error instanceof Error ? error.message : 'Video source parse failed.',
        sourceId: rawSource.id,
      });
    }

    if ((index + 1) % 24 === 0) {
      await yieldToEventLoop();
    }
  }

  const mappedVideos = await mapVideoItemsToAppCategoriesInBatches(dedupeVideos(normalizedVideos));
  const allowedCategorySet = new Set<string>(
    APP_VIDEO_CATEGORIES.filter((category) => category !== '\u63a8\u8350'),
  );
  const filteredVideos = mappedVideos.filter((video) =>
    allowedCategorySet.has(String(video.category)),
  );
  const sortedVideos = sortDefaultVideos(filteredVideos);

  if (sortedVideos.length === 0 && errors.length === 0) {
    return createEmptyResult();
  }

  const stats = buildStats(sortedVideos, Date.now() - startedAt, rawSources.length, errors);

  return {
    errors,
    items: sortedVideos,
    stats,
    status: getResultStatus(sortedVideos, errors),
  };
};

const buildBackendResult = (
  items: VideoItem[],
  initialErrors: VideoPipelineIssue[],
  startedAt: number,
): VideoPipelineResult => {
  const allowedCategorySet = new Set<string>(
    APP_VIDEO_CATEGORIES.filter((category) => category !== '\u63a8\u8350'),
  );
  const filteredVideos = items.filter((video) => allowedCategorySet.has(String(video.category)));
  const sortedVideos = sortDefaultVideos(dedupeVideos(filteredVideos));

  if (sortedVideos.length === 0 && initialErrors.length === 0) {
    const errors: VideoPipelineIssue[] = [
      {
        code: 'EMPTY_RESULT',
        message: 'Backend API returned no videos.',
      },
    ];

    return {
      errors,
      items: [],
      source: 'backend',
      stats: buildStats([], Date.now() - startedAt, items.length, errors),
      status: 'empty',
    };
  }

  return {
    errors: initialErrors,
    items: sortedVideos,
    source: 'backend',
    stats: buildStats(sortedVideos, Date.now() - startedAt, items.length, initialErrors),
    status: getResultStatus(sortedVideos, initialErrors),
  };
};

const crawlAndNormalizeVideos = async (
  context?: VideoServiceContext,
): Promise<VideoPipelineResult> => {
  const startedAt = Date.now();
  const errors: VideoPipelineIssue[] = [];

  if (isBackendApiConfigured()) {
    try {
      const backendItems = await fetchBackendVideos({
        page: 1,
        pageSize: VIDEO_PIPELINE_INITIAL_MAX_VIDEOS,
        signal: context?.signal,
      });
      const backendResult = buildBackendResult(backendItems, [], startedAt);

      if (backendResult.items.length > 0 || context?.bypassCache) {
        return backendResult;
      }
    } catch (error) {
      errors.push({
        code: 'CRAWL_FAILED',
        message:
          error instanceof Error ? `Backend API failed: ${error.message}` : 'Backend API failed.',
      });
    }
  }

  const timeout = createTimeoutSignal(VIDEO_PIPELINE_TIMEOUT_MS);
  const signal = timeout.signal;
  let rawSources: RawVideoSource[] = [];

  let pendingRawProgress: RawVideoSource[] | null = null;
  let scheduledProgressTimer: ReturnType<typeof setTimeout> | null = null;
  let lastEmittedCount = 0;
  let earlyCommitted = false;
  const flushProgress = () => {
    scheduledProgressTimer = null;

    if (!pendingRawProgress) {
      return;
    }

    const partial = pendingRawProgress;
    pendingRawProgress = null;

    if (signal.aborted) {
      return;
    }

    runWhenIdle(() => {
      if (signal.aborted) {
        return;
      }

      const partialItems = buildPartialItems(partial);

      if (partialItems.length === 0) {
        return;
      }

      const hasBetterCache =
        !!cachedVideos &&
        cachedVideos.status === 'ok' &&
        isCacheQualityAtLeast(cachedVideos.items, partialItems);

      if (!hasBetterCache) {
        emitVideos(partialItems);
      }
      lastEmittedCount = partialItems.length;

      if (!earlyCommitted && partialItems.length >= EARLY_COMMIT_THRESHOLD) {
        earlyCommitted = true;

        if (!hasBetterCache) {
          const earlyResult: VideoPipelineResult = {
            errors: [],
            items: partialItems,
            stats: buildStats(partialItems, Date.now() - startedAt, partial.length, []),
            status: 'partial',
          };

          cachedVideos = {
            ...earlyResult,
            expiresAt: Date.now() + VIDEO_CACHE_TTL_MS,
          };
          serviceState = toServiceState(earlyResult, true);
          void savePersistedVideos(partialItems);
          scheduleBackgroundDeepCrawl(earlyResult);
        }
      }
    });
  };
  const handleCrawlerProgress = (partial: RawVideoSource[]) => {
    pendingRawProgress = partial;

    if (scheduledProgressTimer) {
      return;
    }

    const incrementSinceLast = partial.length - lastEmittedCount;
    const shouldEmitImmediately =
      incrementSinceLast >= PROGRESS_EMIT_MIN_INCREMENT ||
      (!earlyCommitted && partial.length >= EARLY_COMMIT_THRESHOLD);

    scheduledProgressTimer = setTimeout(
      flushProgress,
      shouldEmitImmediately ? 0 : PROGRESS_EMIT_INTERVAL_MS,
    );
  };

  try {
    const crawlResult = await crawlConfiguredAuthorizedWebPages(undefined, {
      maxTotalVideos: VIDEO_PIPELINE_INITIAL_MAX_VIDEOS,
      onProgress: handleCrawlerProgress,
      signal,
      sourceOverrides: FOREGROUND_SOURCE_OVERRIDES,
    });

    rawSources = crawlResult.videos;
    errors.push(...mapCrawlerErrorsToIssues(crawlResult.errors));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authorized page crawl failed.';
    errors.push({
      code: 'CRAWL_FAILED',
      message,
    });
  } finally {
    if (scheduledProgressTimer) {
      clearTimeout(scheduledProgressTimer);
      scheduledProgressTimer = null;
    }

    pendingRawProgress = null;
    timeout.cleanup();
  }

  return normalizeRawSourcesToResult(rawSources, errors, startedAt);
};

const shouldThrowResult = (result: VideoPipelineResult) =>
  result.items.length === 0 &&
  (result.status === 'crawl_failed' || result.status === 'parse_failed');

const toServiceError = (result: VideoPipelineResult) => {
  const code = result.status === 'parse_failed' ? 'PARSE_FAILED' : 'CRAWL_FAILED';
  const message =
    result.status === 'parse_failed'
      ? 'All crawled video sources failed to parse.'
      : 'Authorized page crawl failed and no cached videos are available.';

  return new VideoServiceError(code, message, result);
};

const commitCache = (result: VideoPipelineResult) => {
  const previousItems = cachedVideos?.items ?? [];
  const hasPreviousCache = previousItems.length > 0;
  const isFailedEmpty =
    result.items.length === 0 &&
    (result.status === 'crawl_failed' || result.status === 'parse_failed');

  if (isFailedEmpty && hasPreviousCache) {
    serviceState = {
      ...toServiceState(result, false),
      stats: cachedVideos ? cloneStats(cachedVideos.stats) : toServiceState(result, false).stats,
    };
    return;
  }

  const mergedItems =
    hasPreviousCache && result.items.length > 0
      ? mergePreservingEpisodeProgress(result.items, previousItems)
      : result.items;
  const previousQuality = computeCacheQuality(previousItems);
  const mergedQuality = computeCacheQuality(mergedItems);

  const isDrasticDrop =
    hasPreviousCache &&
    result.status === 'ok' &&
    mergedItems.length < previousItems.length * 0.6 &&
    mergedQuality.score <= previousQuality.score;

  if (isDrasticDrop) {
    serviceState = {
      ...toServiceState(result, false),
      stats: cachedVideos ? cloneStats(cachedVideos.stats) : toServiceState(result, false).stats,
    };
    return;
  }

  const mergedResult: VideoPipelineResult = {
    ...result,
    items: mergedItems,
  };

  cachedVideos = {
    ...mergedResult,
    expiresAt: Date.now() + VIDEO_CACHE_TTL_MS,
  };
  serviceState = toServiceState(mergedResult, false);
  emitVideos(mergedItems);

  if (mergedItems.length > 0) {
    void savePersistedVideos(mergedItems);
    // Lazy-load strategy: do not warm up media URLs in the background.
    // The player page will probe + lazy-load when the user opens a video.
    // scheduleLineHeadWarmup() intentionally not invoked here.
  }
};

const cancelScheduledBackgroundDeepCrawl = () => {
  if (backgroundRefreshTimer) {
    clearTimeout(backgroundRefreshTimer);
    backgroundRefreshTimer = undefined;
  }
};

const cancelScheduledLineHeadWarmup = () => {
  if (lineHeadWarmupTimer) {
    clearTimeout(lineHeadWarmupTimer);
    lineHeadWarmupTimer = undefined;
  }
};

const abortLineHeadWarmup = () => {
  cancelScheduledLineHeadWarmup();
  lineHeadWarmupController?.abort();
};

const abortBackgroundDeepCrawl = () => {
  cancelScheduledBackgroundDeepCrawl();
  backgroundCrawlController?.abort();
  abortLineHeadWarmup();
};

const getLineHeadEpisodeTargets = (
  items: VideoItem[],
): {
  videoId: string;
  line: number;
  episode: number;
  playPageUrl: string;
}[] => {
  const targets: {
    videoId: string;
    line: number;
    episode: number;
    playPageUrl: string;
  }[] = [];

  for (const video of items) {
    if (!video.playLines || video.playLines.length === 0) {
      continue;
    }

    let linesCounted = 0;

    for (const line of video.playLines) {
      if (linesCounted >= LINE_HEAD_WARMUP_MAX_LINES_PER_VIDEO) {
        break;
      }

      const firstEpisode = line.episodes
        .slice()
        .sort((left, right) => left.episode - right.episode)[0];

      if (!firstEpisode || firstEpisode.mediaUrl || !firstEpisode.playPageUrl) {
        continue;
      }

      targets.push({
        videoId: video.id,
        line: line.line,
        episode: firstEpisode.episode,
        playPageUrl: firstEpisode.playPageUrl,
      });
      linesCounted += 1;

      if (targets.length >= LINE_HEAD_WARMUP_MAX_EPISODES) {
        return targets;
      }
    }

    if (targets.length >= LINE_HEAD_WARMUP_MAX_EPISODES) {
      break;
    }
  }

  return targets;
};

const runLineHeadWarmup = async () => {
  if (lineHeadWarmupPromise) {
    return;
  }

  const snapshot = cachedVideos?.items ?? [];

  if (snapshot.length === 0) {
    return;
  }

  const targets = getLineHeadEpisodeTargets(snapshot);

  if (targets.length === 0) {
    return;
  }

  const controller = new AbortController();
  lineHeadWarmupController = controller;

  const task = (async () => {
    let pendingUpdates: UpdateEpisodeMediaPayload[] = [];
    const pendingRemovals = new Set<string>();
    let lastFlushAt = Date.now();

    const flushPendingRemovals = () => {
      if (pendingRemovals.size === 0 || controller.signal.aborted) {
        return;
      }

      removeVideosByIds([...pendingRemovals]);
      pendingRemovals.clear();
    };

    const flushPendingUpdates = () => {
      flushPendingRemovals();

      if (pendingUpdates.length === 0 || controller.signal.aborted) {
        return;
      }

      updateEpisodeMediaUrls(pendingUpdates);
      pendingUpdates = [];
      lastFlushAt = Date.now();
    };

    const processTarget = async (target: (typeof targets)[number]) => {
      if (controller.signal.aborted) {
        return;
      }

      if (pendingRemovals.has(target.videoId)) {
        return;
      }

      try {
        const result = await fetchEpisodeMediaUrl(target.playPageUrl, {
          signal: controller.signal,
          timeoutMs: LINE_HEAD_WARMUP_TIMEOUT_MS,
        });

        if (controller.signal.aborted) {
          return;
        }

        if (!result.mediaUrl) {
          pendingRemovals.add(target.videoId);
          return;
        }

        const probe = await probeMediaUrlReachable(result.mediaUrl, {
          signal: controller.signal,
          timeoutMs: MEDIA_PROBE_TIMEOUT_MS,
        });

        if (controller.signal.aborted) {
          return;
        }

        if (!probe.reachable) {
          pendingRemovals.add(target.videoId);
          return;
        }

        pendingUpdates.push({
          episode: target.episode,
          format: result.format,
          line: target.line,
          mediaUrl: result.mediaUrl,
          sourceType: result.sourceType,
          videoId: target.videoId,
        });
      } catch {
        // Single-episode failures are swallowed; warmup is best-effort.
      }
    };

    for (let index = 0; index < targets.length; index += LINE_HEAD_WARMUP_CONCURRENCY) {
      if (controller.signal.aborted) {
        return;
      }

      const chunk = targets.slice(index, index + LINE_HEAD_WARMUP_CONCURRENCY);
      await Promise.allSettled(chunk.map(processTarget));

      if (
        pendingUpdates.length >= LINE_HEAD_WARMUP_FLUSH_SIZE ||
        pendingRemovals.size > 0 ||
        Date.now() - lastFlushAt >= LINE_HEAD_WARMUP_FLUSH_INTERVAL_MS
      ) {
        flushPendingUpdates();
        await yieldToEventLoop();
      }

      if (index + LINE_HEAD_WARMUP_CONCURRENCY < targets.length && !controller.signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, LINE_HEAD_WARMUP_INTERVAL_MS));
      }
    }

    flushPendingUpdates();
    flushPendingRemovals();
  })();

  lineHeadWarmupPromise = task.finally(() => {
    if (lineHeadWarmupController === controller) {
      lineHeadWarmupController = undefined;
    }

    lineHeadWarmupPromise = undefined;
  });
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const scheduleLineHeadWarmup = () => {
  if (lineHeadWarmupTimer || lineHeadWarmupPromise) {
    return;
  }

  const snapshot = cachedVideos?.items ?? [];

  if (snapshot.length === 0) {
    return;
  }

  lineHeadWarmupTimer = setTimeout(() => {
    lineHeadWarmupTimer = undefined;
    void runLineHeadWarmup();
  }, LINE_HEAD_WARMUP_DELAY_MS);
};

const runBackgroundDeepCrawl = () => {
  if (backgroundRefreshPromise) {
    return backgroundRefreshPromise;
  }

  if (refreshPromise) {
    return Promise.resolve(undefined);
  }

  const currentCache = cachedVideos;

  if (!currentCache || currentCache.items.length === 0) {
    return Promise.resolve(undefined);
  }

  if (currentCache.items.length >= VIDEO_PIPELINE_BACKGROUND_MAX_VIDEOS) {
    return Promise.resolve(undefined);
  }

  const now = Date.now();
  const cacheIsFarBelowTarget = currentCache.items.length < RECOVERY_CACHE_THRESHOLD;

  if (
    lastBackgroundRefreshAttemptAt > 0 &&
    now - lastBackgroundRefreshAttemptAt < BACKGROUND_REFRESH_MIN_INTERVAL_MS &&
    !shouldBypassRefreshThrottleForCache(currentCache) &&
    !cacheIsFarBelowTarget
  ) {
    return Promise.resolve(undefined);
  }

  lastBackgroundRefreshAttemptAt = now;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VIDEO_BACKGROUND_PIPELINE_TIMEOUT_MS);
  backgroundCrawlController = controller;
  markRefreshing(true);

  backgroundRefreshPromise = crawlConfiguredAuthorizedWebPages(undefined, {
    maxTotalVideos: VIDEO_PIPELINE_BACKGROUND_MAX_VIDEOS,
    signal: controller.signal,
    sourceOverrides: BACKGROUND_SOURCE_OVERRIDES,
  })
    .then((crawlResult) =>
      normalizeRawSourcesToResult(
        crawlResult.videos,
        mapCrawlerErrorsToIssues(crawlResult.errors),
        startedAt,
      ),
    )
    .then((result) => {
      const currentItems = cachedVideos?.items ?? [];
      const shouldCommit = isCandidateCacheBetter(result.items, currentItems);

      if (shouldCommit) {
        commitCache(result);
      } else {
        serviceState = {
          ...serviceState,
          cache: getCacheState(),
          isRefreshing: false,
        };
      }

      // Lazy-load strategy: do not warm up media URLs after deep crawl.
      // scheduleLineHeadWarmup() intentionally not invoked here either.

      return result;
    })
    .catch((error) => {
      if ((error as Error)?.name !== 'AbortError') {
        console.warn(
          '[videoService] background deep crawl failed',
          error instanceof Error ? error.message : String(error),
        );
      }

      return undefined;
    })
    .finally(() => {
      clearTimeout(timeoutId);

      if (backgroundCrawlController === controller) {
        backgroundCrawlController = undefined;
      }

      backgroundRefreshPromise = undefined;
      markRefreshing(false);

      // Auto-reschedule the next deep crawl: if we still haven't reached the
      // background target, queue another pass. Use a short interval when the
      // current cache is far below target (under 50 cards = something
      // probably went wrong on this pass) so the user doesn't sit looking
      // at 12 cards forever.
      const currentCount = cachedVideos?.items.length ?? 0;
      if (currentCount < VIDEO_PIPELINE_BACKGROUND_MAX_VIDEOS) {
        const isFarBelow = currentCount < RECOVERY_CACHE_THRESHOLD;
        const nextDelay = isFarBelow
          ? BACKGROUND_DEEP_CRAWL_RECOVERY_DELAY_MS
          : BACKGROUND_REFRESH_MIN_INTERVAL_MS;
        if (!backgroundRefreshTimer && !backgroundRefreshPromise) {
          backgroundRefreshTimer = setTimeout(() => {
            backgroundRefreshTimer = undefined;
            void runBackgroundDeepCrawl();
          }, nextDelay);
        }
      }
    });

  return backgroundRefreshPromise;
};

const scheduleBackgroundDeepCrawl = (result: VideoPipelineResult) => {
  if (result.items.length === 0) {
    return;
  }

  if (result.status !== 'ok' && result.status !== 'partial') {
    return;
  }

  if (result.items.length >= VIDEO_PIPELINE_BACKGROUND_MAX_VIDEOS) {
    return;
  }

  if (backgroundRefreshTimer || backgroundRefreshPromise) {
    return;
  }

  backgroundRefreshTimer = setTimeout(() => {
    backgroundRefreshTimer = undefined;
    void runBackgroundDeepCrawl();
  }, BACKGROUND_DEEP_CRAWL_DELAY_MS);
};

const refreshVideos = async (context?: VideoServiceContext): Promise<VideoPipelineResult> => {
  if (refreshPromise) {
    return refreshPromise;
  }

  if (context?.bypassCache) {
    abortBackgroundDeepCrawl();
  }

  const now = Date.now();
  const sinceLastAttempt = now - lastRefreshAttemptAt;
  const isThrottled =
    !context?.bypassCache &&
    lastRefreshAttemptAt > 0 &&
    sinceLastAttempt < REFRESH_MIN_INTERVAL_MS &&
    !!cachedVideos &&
    cachedVideos.items.length > 0 &&
    !shouldBypassRefreshThrottleForCache(cachedVideos);

  if (isThrottled && cachedVideos) {
    return {
      errors: cachedVideos.errors,
      items: cachedVideos.items,
      stats: cachedVideos.stats,
      status: cachedVideos.status,
    };
  }

  lastRefreshAttemptAt = now;
  markRefreshing(true);
  refreshPromise = crawlAndNormalizeVideos(context)
    .then((result) => {
      commitCache(result);

      if (result.source !== 'backend') {
        scheduleBackgroundDeepCrawl(result);
      }

      if (shouldResetRefreshThrottleAfterResult(result)) {
        lastRefreshAttemptAt = 0;
      }

      return result;
    })
    .catch((error) => {
      const result: VideoPipelineResult = {
        errors: [
          {
            code: 'CRAWL_FAILED',
            message: error instanceof Error ? error.message : 'Authorized page crawl failed.',
          },
        ],
        items: [],
        stats: buildStats([], 0, 0, [
          {
            code: 'CRAWL_FAILED',
            message: error instanceof Error ? error.message : 'Authorized page crawl failed.',
          },
        ]),
        status: 'crawl_failed',
      };

      serviceState = toServiceState(result, false);
      lastRefreshAttemptAt = 0;
      return result;
    })
    .finally(() => {
      refreshPromise = undefined;
      markRefreshing(false);
    });

  return refreshPromise;
};

const revalidateInBackground = () => {
  if (refreshPromise) {
    return;
  }

  const sinceLastAttempt = Date.now() - lastRefreshAttemptAt;

  if (
    lastRefreshAttemptAt > 0 &&
    sinceLastAttempt < REFRESH_MIN_INTERVAL_MS &&
    cachedVideos &&
    cachedVideos.items.length > 0 &&
    !shouldBypassRefreshThrottleForCache(cachedVideos)
  ) {
    return;
  }

  void refreshVideos().then((result) => {
    if (shouldThrowResult(result) && cachedVideos) {
      serviceState = {
        ...toServiceState(result, false),
        stats: cloneStats(cachedVideos.stats),
      };
    }
  });
};

export const getAllVideos = async (context?: VideoServiceContext): Promise<VideoItem[]> => {
  const now = Date.now();
  let currentCache = cachedVideos;

  if (!context?.bypassCache && !currentCache) {
    const hydratedItems = await hydrateFromPersistedCache();

    if (hydratedItems && hydratedItems.length > 0) {
      currentCache = cachedVideos;
    }
  }

  if (!context?.bypassCache && currentCache) {
    if (currentCache.expiresAt <= now) {
      revalidateInBackground();
    }

    return currentCache.items;
  }

  const result = await refreshVideos(context);

  if (shouldThrowResult(result)) {
    if (cachedVideos && !context?.bypassCache) {
      return cachedVideos.items;
    }

    if (!context?.bypassCache) {
      return [];
    }

    throw toServiceError(result);
  }

  return result.items;
};

export const getVideoServiceStats = (): VideoPipelineStats => cloneStats(serviceState.stats);

export const getVideoServiceState = (): VideoServiceState => ({
  ...serviceState,
  stats: cloneStats(serviceState.stats),
});

export const clearVideoServiceCache = () => {
  abortBackgroundDeepCrawl();
  cachedVideos = undefined;
  hydratePromise = undefined;
  lastRefreshAttemptAt = 0;
  lastBackgroundRefreshAttemptAt = 0;
  serviceState = {
    cache: defaultCacheState,
    errors: [],
    isRefreshing: false,
    stats: cloneStats(defaultStats),
    status: 'idle',
  };
  emitVideos([]);
  void clearPersistedVideos();
  void clearDiscoveredWebPages();
};

export const getVideoById = async (
  id: string,
  context?: VideoServiceContext,
): Promise<VideoItem | undefined> => {
  if (isBackendApiConfigured() && context?.bypassCache) {
    try {
      const backendItem = await fetchBackendVideoById(id, { signal: context.signal });

      if (backendItem) {
        if (cachedVideos) {
          const hasItem = cachedVideos.items.some((video) => video.id === backendItem.id);
          const nextItems = hasItem
            ? cachedVideos.items.map((video) => (video.id === backendItem.id ? backendItem : video))
            : [backendItem, ...cachedVideos.items];

          cachedVideos = {
            ...cachedVideos,
            expiresAt: Date.now() + VIDEO_CACHE_TTL_MS,
            items: sortDefaultVideos(dedupeVideos(nextItems)),
          };
          emitVideos(cachedVideos.items);
          void savePersistedVideos(cachedVideos.items);
        }

        return backendItem;
      }
    } catch (error) {
      console.warn(
        '[videoService] backend detail failed, falling back to cached list',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const videos = await getAllVideos(context);

  return videos.find((video) => video.id === id);
};

export const getVideosByCategory = async (
  category: VideoCategory | string,
  context?: VideoServiceContext,
): Promise<VideoItem[]> => {
  const videos = await getAllVideos(context);
  const appCategory = mapCategoryToAppCategory(category);

  if (appCategory === '\u63a8\u8350') {
    return getRecommendedVideos(context);
  }

  return sortDefaultVideos(videos.filter((video) => video.category === appCategory));
};

const includesKeyword = (value: string | undefined, keyword: string) =>
  value?.toLowerCase().includes(keyword) ?? false;

const getSearchScore = (video: VideoItem, keyword: string) => {
  let score = 0;

  if (includesKeyword(video.title, keyword)) {
    score += video.title.toLowerCase().startsWith(keyword) ? 140 : 100;
  }

  if ((video.tags ?? []).some((tag) => tag.toLowerCase().includes(keyword))) {
    score += 70;
  }

  if (includesKeyword(video.description, keyword)) {
    score += 35;
  }

  if (includesKeyword(video.subCategory, keyword) || includesKeyword(video.rawCategory, keyword)) {
    score += 42;
  }

  if (includesKeyword(video.author, keyword) || includesKeyword(video.provider, keyword)) {
    score += 20;
  }

  if (includesKeyword(video.source, keyword)) {
    score += 18;
  }

  if (includesKeyword(String(video.category), keyword)) {
    score += 12;
  }

  return score;
};

type RecommendationPreference = {
  categories: Map<string, number>;
  favoriteIds: Set<string>;
  historyIds: Map<string, number>;
  latestHistoryAt: number;
};

const normalizeCategoryKey = (category?: string) =>
  mapCategoryToAppCategory(category).toLowerCase();

const addCategoryPreference = (
  categories: Map<string, number>,
  category: string | undefined,
  weight: number,
) => {
  if (!category) {
    return;
  }

  const key = normalizeCategoryKey(category);
  categories.set(key, (categories.get(key) ?? 0) + weight);
};

const getHistoryPreference = (videos: VideoItem[]) => {
  try {
    return usePlayHistoryStore.getState().history.reduce(
      (preference, item, index) => {
        const video = videos.find((candidate) => candidate.id === item.videoId);
        const recencyWeight = Math.max(1, 12 - index);

        preference.historyIds.set(item.videoId, recencyWeight);
        preference.latestHistoryAt = Math.max(
          preference.latestHistoryAt,
          toTimestamp(item.updatedAt),
        );
        addCategoryPreference(preference.categories, String(video?.category ?? ''), recencyWeight);

        return preference;
      },
      {
        categories: new Map<string, number>(),
        favoriteIds: new Set<string>(),
        historyIds: new Map<string, number>(),
        latestHistoryAt: 0,
      } as RecommendationPreference,
    );
  } catch {
    return {
      categories: new Map<string, number>(),
      favoriteIds: new Set<string>(),
      historyIds: new Map<string, number>(),
      latestHistoryAt: 0,
    } as RecommendationPreference;
  }
};

const getRecommendationPreference = (
  videos: VideoItem[],
  context?: VideoServiceContext,
): RecommendationPreference => {
  const preference = getHistoryPreference(videos);

  for (const id of context?.favoriteVideoIds ?? []) {
    preference.favoriteIds.add(id);
    const video = videos.find((item) => item.id === id);
    addCategoryPreference(preference.categories, String(video?.category ?? ''), 16);
  }

  for (const category of context?.favoriteCategories ?? []) {
    addCategoryPreference(preference.categories, String(category), 14);
  }

  for (const category of context?.preferredCategories ?? []) {
    addCategoryPreference(preference.categories, String(category), 10);
  }

  try {
    const defaultSort = useSettingsStore.getState().defaultSort;

    if (defaultSort === 'latest') {
      preference.categories.set('__latest__', 1);
    }

    if (defaultSort === 'mostPlayed') {
      preference.categories.set('__mostPlayed__', 1);
    }
  } catch {
    // Settings are optional for recommendation; content ranking remains deterministic.
  }

  return preference;
};

const getRecommendationScore = (video: VideoItem, preference: RecommendationPreference) => {
  const categoryWeight =
    preference.categories.get(normalizeCategoryKey(String(video.category))) ?? 0;
  const favoriteBoost = preference.favoriteIds.has(video.id) ? 180 : 0;
  const historyBoost = preference.historyIds.get(video.id) ?? 0;
  const playableBoost = video.playableInApp ? 320 : 0;
  const recentScore = getRecencyScore(video.createdAt);
  const engagementScore = Math.min(getEngagementScore(video) / 1_000, 90);
  const latestSettingBoost = preference.categories.has('__latest__') ? recentScore * 0.7 : 0;
  const mostPlayedSettingBoost = preference.categories.has('__mostPlayed__')
    ? engagementScore * 0.7
    : 0;
  const priorityScore = categoryPriorityFor(video) / 10_000;

  return (
    playableBoost +
    favoriteBoost +
    historyBoost * 9 +
    categoryWeight * 12 +
    recentScore +
    engagementScore +
    latestSettingBoost +
    mostPlayedSettingBoost +
    priorityScore
  );
};

export const searchVideos = async (
  keyword: string,
  context?: VideoServiceContext,
): Promise<VideoItem[]> => {
  const normalizedKeyword = keyword.trim().toLowerCase();

  if (isBackendApiConfigured() && normalizedKeyword) {
    try {
      const backendResults = await searchBackendVideos(keyword, { signal: context?.signal });
      const allowedCategorySet = new Set<string>(
        APP_VIDEO_CATEGORIES.filter((category) => category !== '\u63a8\u8350'),
      );

      return sortDefaultVideos(
        dedupeVideos(
          backendResults.filter((video) => allowedCategorySet.has(String(video.category))),
        ),
      );
    } catch (error) {
      console.warn(
        '[videoService] backend search failed, falling back to local search',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  const videos = await getAllVideos(context);

  if (!normalizedKeyword) {
    return videos;
  }

  return videos
    .map((video) => ({
      score: getSearchScore(video, normalizedKeyword),
      video,
    }))
    .filter((item) => item.score > 0)
    .sort((first, second) => {
      const relevanceDelta = second.score - first.score;

      if (relevanceDelta !== 0) {
        return relevanceDelta;
      }

      const playableDelta = Number(second.video.playableInApp) - Number(first.video.playableInApp);

      if (playableDelta !== 0) {
        return playableDelta;
      }

      return compareByDefaultOrder(first.video, second.video);
    })
    .map((item) => item.video);
};

export const getRecommendedVideos = async (context?: VideoServiceContext): Promise<VideoItem[]> => {
  const videos = await getAllVideos(context);
  const preference = getRecommendationPreference(videos, context);

  return [...videos].sort((first, second) => {
    const scoreDelta =
      getRecommendationScore(second, preference) - getRecommendationScore(first, preference);

    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    const playableDelta = Number(second.playableInApp) - Number(first.playableInApp);

    if (playableDelta !== 0) {
      return playableDelta;
    }

    return compareByDefaultOrder(first, second);
  });
};

export const getPlayableVideos = async (context?: VideoServiceContext): Promise<VideoItem[]> => {
  const videos = await getAllVideos(context);

  return [...videos].filter((video) => video.playableInApp).sort(comparePlayableVideos);
};

export const getUnsupportedVideos = async (context?: VideoServiceContext): Promise<VideoItem[]> => {
  const videos = await getAllVideos(context);

  return [...videos].filter((video) => !video.playableInApp).sort(compareUnsupportedVideos);
};

export const listVideoItems = getAllVideos;
export const getVideoItem = getVideoById;
