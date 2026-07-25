import {
  clearPersistedVideos,
  loadPersistedVideoCache,
  savePersistedVideos,
} from '@/services/videoCacheStorage';
import { isPlayableOrResolvable } from '@/domain/video/playability';
import type { VideoItem, VideoPlayLine } from '@/types/video';

import type {
  VideoCache,
  VideoPipelineIssue,
  VideoPipelineResult,
  VideoPipelineStats,
  VideoServiceCacheState,
  VideoServiceState,
  VideoSubscriber,
} from './videoTypes';

export const VIDEO_CACHE_TTL_MS = 300_000;

export const defaultCacheState: VideoServiceCacheState = {
  hasCache: false,
  isStale: false,
  itemCount: 0,
  ttlMs: VIDEO_CACHE_TTL_MS,
};

export const defaultStats: VideoPipelineStats = {
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
let hydratePromise: Promise<VideoItem[] | undefined> | undefined;
let serviceState: VideoServiceState = {
  cache: defaultCacheState,
  errors: [],
  isRefreshing: false,
  stats: defaultStats,
  status: 'idle',
};

const videoSubscribers = new Set<VideoSubscriber>();

export const cloneStats = (stats: VideoPipelineStats): VideoPipelineStats => ({
  ...stats,
  categoryDistribution: { ...stats.categoryDistribution },
  failureReasonDistribution: { ...stats.failureReasonDistribution },
});

export const getCurrentCache = () => cachedVideos;

export const getCachedItems = () => cachedVideos?.items ?? [];

export const getVideoCacheVersion = () => cacheVersion;

export const getCacheState = (): VideoServiceCacheState => {
  const now = Date.now();

  return {
    expiresAt: cachedVideos ? new Date(cachedVideos.expiresAt).toISOString() : undefined,
    hasCache: Boolean(cachedVideos),
    isStale: Boolean(cachedVideos && cachedVideos.expiresAt <= now),
    itemCount: cachedVideos?.items.length ?? 0,
    ttlMs: VIDEO_CACHE_TTL_MS,
  };
};

export const getVideoServiceState = (): VideoServiceState => ({
  ...serviceState,
  stats: cloneStats(serviceState.stats),
});

export const getVideoServiceStats = (): VideoPipelineStats => cloneStats(serviceState.stats);

export const setVideoServiceState = (nextState: VideoServiceState) => {
  serviceState = nextState;
};

export const patchVideoServiceState = (patch: Partial<VideoServiceState>) => {
  serviceState = {
    ...serviceState,
    ...patch,
  };
};

export const setRefreshing = (isRefreshing: boolean) => {
  serviceState = {
    ...serviceState,
    cache: getCacheState(),
    isRefreshing,
  };
};

export const emitVideos = (videos: VideoItem[]) => {
  cacheVersion += 1;
  const meta = { version: cacheVersion };

  for (const subscriber of videoSubscribers) {
    try {
      subscriber(videos, meta);
    } catch (error) {
      console.warn(
        '[videoCache] subscriber threw',
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
        '[videoCache] initial subscriber threw',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return () => {
    videoSubscribers.delete(callback);
  };
};

export const buildStats = (
  items: VideoItem[],
  durationMs: number,
  rawTotal: number,
  errors: VideoPipelineIssue[],
): VideoPipelineStats => {
  const categoryDistribution = items.reduce<Record<string, number>>((acc, item) => {
    const key = String(item.category || 'uncategorized');
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const failureReasonDistribution = errors.reduce<Record<string, number>>((acc, issue) => {
    acc[issue.code] = (acc[issue.code] ?? 0) + 1;
    return acc;
  }, {});

  return {
    categoryDistribution,
    crawlFailed: errors.filter((issue) => issue.code === 'CRAWL_FAILED').length,
    crawlTotal: rawTotal,
    durationMs,
    failureReasonDistribution,
    parseFailed: errors.filter((issue) => issue.code === 'PARSE_FAILED').length,
    playable: items.filter(isPlayableOrResolvable).length,
    policyRejected: errors.filter((issue) => issue.code === 'POLICY_REJECTED').length,
    rawTotal,
    total: items.length,
    unsupported: items.filter((item) => !isPlayableOrResolvable(item)).length,
    updatedAt: new Date().toISOString(),
  };
};

export const toServiceState = (
  result: VideoPipelineResult,
  isRefreshing = false,
): VideoServiceState => ({
  cache: getCacheState(),
  errors: result.errors,
  isRefreshing,
  lastUpdatedAt: result.stats.updatedAt,
  stats: cloneStats(result.stats),
  status: result.status,
});

const countEpisodesOnItem = (video: VideoItem) =>
  (video.playLines ?? []).reduce((sum, line) => sum + line.episodes.length, 0);

const countResolvedEpisodesOnItem = (video: VideoItem) =>
  (video.playLines ?? []).reduce(
    (sum, line) => sum + line.episodes.filter((episode) => Boolean(episode.mediaUrl)).length,
    0,
  );

export const computeCacheQuality = (items: VideoItem[]) => {
  const withPlayLines = items.filter((video) => (video.playLines?.length ?? 0) > 0).length;
  const episodeTotal = items.reduce((sum, video) => sum + countEpisodesOnItem(video), 0);
  const resolvedEpisodeTotal = items.reduce(
    (sum, video) => sum + countResolvedEpisodesOnItem(video),
    0,
  );
  const playableTotal = items.filter(isPlayableOrResolvable).length;
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

export const isCandidateCacheBetter = (candidateItems: VideoItem[], currentItems: VideoItem[]) => {
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

export const isIncompleteCache = (items: VideoItem[]) => {
  if (items.length === 0) {
    return true;
  }

  const quality = computeCacheQuality(items);
  const minimumPlayLineCards = Math.min(8, Math.ceil(items.length * 0.2));

  return quality.withPlayLines < minimumPlayLineCards || quality.episodeTotal === 0;
};

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

const getHydratedCacheExpiry = (savedAt: number | undefined) => {
  const baseTime = typeof savedAt === 'number' && Number.isFinite(savedAt) ? savedAt : Date.now();

  return baseTime + VIDEO_CACHE_TTL_MS;
};

export const setCachedResult = (
  result: VideoPipelineResult,
  options?: {
    emit?: boolean;
    expiresAt?: number;
    isRefreshing?: boolean;
    persist?: boolean;
    preserveEpisodeProgress?: boolean;
  },
) => {
  const previousItems = cachedVideos?.items ?? [];
  const items =
    options?.preserveEpisodeProgress === false
      ? result.items
      : mergePreservingEpisodeProgress(result.items, previousItems);
  const nextResult = { ...result, items };

  cachedVideos = {
    ...nextResult,
    expiresAt: options?.expiresAt ?? Date.now() + VIDEO_CACHE_TTL_MS,
  };
  serviceState = toServiceState(nextResult, options?.isRefreshing ?? false);

  if (options?.emit !== false) {
    emitVideos(items);
  }

  if (options?.persist !== false && items.length > 0) {
    void savePersistedVideos(items);
  }

  return cachedVideos;
};

export const commitCache = (result: VideoPipelineResult) => {
  const previousItems = cachedVideos?.items ?? [];
  const hasPreviousCache = previousItems.length > 0;
  const isFailedEmpty =
    result.items.length === 0 &&
    (result.status === 'crawl_failed' || result.status === 'parse_failed');
  const isBackendSoftEmpty =
    result.source === 'backend' && result.items.length === 0 && result.status === 'empty';

  if ((isFailedEmpty || isBackendSoftEmpty) && hasPreviousCache) {
    serviceState = {
      ...toServiceState(result, false),
      stats: cachedVideos ? cloneStats(cachedVideos.stats) : toServiceState(result, false).stats,
    };
    return;
  }

  const mergedItems = mergePreservingEpisodeProgress(result.items, previousItems);
  const previousQuality = computeCacheQuality(previousItems);
  const mergedQuality = computeCacheQuality(mergedItems);
  const isDrasticDrop =
    hasPreviousCache &&
    result.source !== 'backend' &&
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

  setCachedResult({ ...result, items: mergedItems }, { preserveEpisodeProgress: false });
};

export const replaceCachedItems = (
  items: VideoItem[],
  buildResult: (items: VideoItem[]) => VideoPipelineResult,
) => {
  if (!cachedVideos) {
    return;
  }

  setCachedResult(buildResult(items), { preserveEpisodeProgress: false });
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
        const result: VideoPipelineResult = {
          errors: [],
          items,
          stats,
          status: 'partial',
        };
        setCachedResult(result, {
          emit: true,
          expiresAt: getHydratedCacheExpiry(snapshot?.savedAt),
          persist: false,
          preserveEpisodeProgress: false,
        });

        return items;
      })
      .catch((error) => {
        console.warn(
          '[videoCache] hydrate failed',
          error instanceof Error ? error.message : String(error),
        );
        return undefined;
      });
  }

  return hydratePromise;
};

export const clearVideoCache = () => {
  cachedVideos = undefined;
  hydratePromise = undefined;
  serviceState = {
    cache: defaultCacheState,
    errors: [],
    isRefreshing: false,
    stats: cloneStats(defaultStats),
    status: 'idle',
  };
  emitVideos([]);
  void clearPersistedVideos();
};
