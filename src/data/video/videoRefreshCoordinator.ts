import type { ProviderCrawlerSourceOverrides } from '@/data/providers/providerTypes';

import {
  buildStats,
  commitCache,
  getCurrentCache,
  isCandidateCacheBetter,
  isIncompleteCache,
  patchVideoServiceState,
  setRefreshing,
  toServiceState,
} from './videoCache';
import {
  fetchAndNormalizeVideos,
  fetchBackgroundVideos,
  normalizeRawSourcesToResult,
} from './videoRepository';
import type { VideoPipelineIssue, VideoPipelineResult, VideoServiceContext } from './videoTypes';

const VIDEO_BACKGROUND_PIPELINE_TIMEOUT_MS = 600_000;
const VIDEO_PIPELINE_BACKGROUND_MAX_VIDEOS = 1_400;
const BACKGROUND_DEEP_CRAWL_DELAY_MS = 8_000;
const BACKGROUND_DEEP_CRAWL_RECOVERY_DELAY_MS = 30_000;
const BACKGROUND_REFRESH_MIN_INTERVAL_MS = 180_000;
const RECOVERY_CACHE_THRESHOLD = 50;
const REFRESH_MIN_INTERVAL_MS = 15_000;
const BACKGROUND_SOURCE_OVERRIDES: ProviderCrawlerSourceOverrides = {
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

let refreshPromise: Promise<VideoPipelineResult> | undefined;
let backgroundRefreshPromise: Promise<VideoPipelineResult | undefined> | undefined;
let backgroundRefreshTimer: ReturnType<typeof setTimeout> | undefined;
let backgroundCrawlController: AbortController | undefined;
let lastRefreshAttemptAt = 0;
let lastBackgroundRefreshAttemptAt = 0;

const shouldThrowResult = (result: VideoPipelineResult) =>
  result.items.length === 0 &&
  (result.status === 'crawl_failed' || result.status === 'parse_failed');

const hasBackoffLikeIssue = (result: VideoPipelineResult) =>
  result.errors.some((issue) => /backoff|403|429|503|rate limit|too many/i.test(issue.message));

const shouldResetRefreshThrottleAfterResult = (result: VideoPipelineResult) =>
  shouldThrowResult(result) || hasBackoffLikeIssue(result);

const shouldBypassRefreshThrottleForCache = () => {
  const cache = getCurrentCache();
  return Boolean(cache && (cache.status !== 'ok' || isIncompleteCache(cache.items)));
};

export const abortBackgroundDeepCrawl = () => {
  if (backgroundRefreshTimer) {
    clearTimeout(backgroundRefreshTimer);
    backgroundRefreshTimer = undefined;
  }

  backgroundCrawlController?.abort();
  backgroundCrawlController = undefined;
  backgroundRefreshPromise = undefined;
};

const runBackgroundDeepCrawl = () => {
  if (backgroundRefreshPromise) {
    return backgroundRefreshPromise;
  }

  if (refreshPromise) {
    return Promise.resolve(undefined);
  }

  const currentCache = getCurrentCache();

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
    !shouldBypassRefreshThrottleForCache() &&
    !cacheIsFarBelowTarget
  ) {
    return Promise.resolve(undefined);
  }

  lastBackgroundRefreshAttemptAt = now;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VIDEO_BACKGROUND_PIPELINE_TIMEOUT_MS);
  backgroundCrawlController = controller;
  setRefreshing(true);

  backgroundRefreshPromise = fetchBackgroundVideos({
    maxTotalVideos: VIDEO_PIPELINE_BACKGROUND_MAX_VIDEOS,
    signal: controller.signal,
    sourceOverrides: BACKGROUND_SOURCE_OVERRIDES,
  })
    .then((result) => {
      if (!result) {
        return undefined;
      }

      const currentItems = getCurrentCache()?.items ?? [];
      const shouldCommit = isCandidateCacheBetter(result.items, currentItems);

      if (shouldCommit) {
        commitCache(result);
      } else {
        patchVideoServiceState({
          cache: getCurrentCache()
            ? {
                expiresAt: new Date(getCurrentCache()!.expiresAt).toISOString(),
                hasCache: true,
                isStale: getCurrentCache()!.expiresAt <= Date.now(),
                itemCount: getCurrentCache()!.items.length,
                ttlMs: 300_000,
              }
            : undefined,
          isRefreshing: false,
        });
      }

      return result;
    })
    .catch((error) => {
      if ((error as Error)?.name !== 'AbortError') {
        console.warn(
          '[videoRefreshCoordinator] background deep crawl failed',
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
      setRefreshing(false);

      const currentCount = getCurrentCache()?.items.length ?? 0;
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

export const refreshVideos = async (
  context?: VideoServiceContext,
): Promise<VideoPipelineResult> => {
  if (refreshPromise) {
    return refreshPromise;
  }

  if (context?.bypassCache) {
    abortBackgroundDeepCrawl();
  }

  const now = Date.now();
  const cache = getCurrentCache();
  const sinceLastAttempt = now - lastRefreshAttemptAt;
  const isThrottled =
    !context?.bypassCache &&
    lastRefreshAttemptAt > 0 &&
    sinceLastAttempt < REFRESH_MIN_INTERVAL_MS &&
    !!cache &&
    cache.items.length > 0 &&
    !shouldBypassRefreshThrottleForCache();

  if (isThrottled && cache) {
    return {
      errors: cache.errors,
      items: cache.items,
      source: cache.source,
      stats: cache.stats,
      status: cache.status,
    };
  }

  lastRefreshAttemptAt = now;
  setRefreshing(true);
  refreshPromise = fetchAndNormalizeVideos(context)
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
      const issue: VideoPipelineIssue = {
        code: 'CRAWL_FAILED',
        message: error instanceof Error ? error.message : 'Authorized page crawl failed.',
      };
      const result: VideoPipelineResult = {
        errors: [issue],
        items: [],
        stats: buildStats([], 0, 0, [issue]),
        status: 'crawl_failed',
      };

      patchVideoServiceState(toServiceState(result, false));
      lastRefreshAttemptAt = 0;
      return result;
    })
    .finally(() => {
      refreshPromise = undefined;
      setRefreshing(false);
    });

  return refreshPromise;
};

export const revalidateInBackground = () => {
  if (refreshPromise) {
    return;
  }

  const sinceLastAttempt = Date.now() - lastRefreshAttemptAt;
  const cache = getCurrentCache();

  if (
    lastRefreshAttemptAt > 0 &&
    sinceLastAttempt < REFRESH_MIN_INTERVAL_MS &&
    cache &&
    cache.items.length > 0 &&
    !shouldBypassRefreshThrottleForCache()
  ) {
    return;
  }

  void refreshVideos().then((result) => {
    const nextCache = getCurrentCache();

    if (shouldThrowResult(result) && nextCache) {
      patchVideoServiceState({
        ...toServiceState(result, false),
        stats: nextCache.stats,
      });
    }
  });
};

export const resetRefreshCoordinator = () => {
  abortBackgroundDeepCrawl();
  lastRefreshAttemptAt = 0;
  lastBackgroundRefreshAttemptAt = 0;
};

export { normalizeRawSourcesToResult };
