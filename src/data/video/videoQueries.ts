import { clearLocalCrawlerProviderState } from '@/data/providers/localCrawlerProvider';
import { isPlayableOrResolvable } from '@/domain/video/playability';
import { usePlayHistoryStore } from '@/store/playHistoryStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { VideoCategory, VideoItem } from '@/types/video';

import {
  buildStats,
  clearVideoCache,
  getCachedItems,
  getCurrentCache,
  hydrateFromPersistedCache,
  setCachedResult,
} from './videoCache';
import {
  dedupeVideos,
  fetchBackendVideoPage,
  fetchVideoDetail,
  clearVideoRepositoryCaches,
  searchProviderVideos,
} from './videoRepository';
import {
  comparePlayableVideos,
  compareUnsupportedVideos,
  getEngagementScore,
  getRecencyScore,
  getSearchRelevanceScore,
  rankRecommendedVideos,
  sortDefaultVideos,
  sortSearchResults,
  toTimestamp,
} from './videoRanking';
import {
  abortBackgroundDeepCrawl,
  refreshVideos,
  resetRefreshCoordinator,
  revalidateInBackground,
} from './videoRefreshCoordinator';
import type {
  VideoPageContext,
  VideoPageResult,
  VideoPipelineResult,
  VideoServiceContext,
} from './videoTypes';
import { VideoServiceError } from './videoTypes';
import { mapCategoryToAppCategory } from '@/services/categoryService';

const DEFAULT_BACKEND_PAGE_SIZE = 200;
const SEARCH_CACHE_TTL_MS = 5 * 60_000;
const MAX_SEARCH_CACHE_ENTRIES = 20;

const searchResultCache = new Map<
  string,
  {
    expiresAt: number;
    items: VideoItem[];
  }
>();

const shouldThrowResult = (result: VideoPipelineResult) =>
  result.items.length === 0 &&
  (result.status === 'crawl_failed' || result.status === 'parse_failed');

const toServiceError = (result: VideoPipelineResult) => {
  const firstMessage = result.errors[0]?.message;
  const isBackendUnreachable =
    result.source === 'backend' &&
    firstMessage &&
    /network request failed|timed out|aborted|backend api/i.test(firstMessage);
  const code =
    result.status === 'parse_failed'
      ? 'PARSE_FAILED'
      : isBackendUnreachable
        ? 'BACKEND_UNREACHABLE'
        : 'CRAWL_FAILED';
  const message =
    result.status === 'parse_failed'
      ? '视频数据解析失败。'
      : isBackendUnreachable
        ? `后端 API 连接失败：${firstMessage}`
        : '视频数据加载失败，且本地没有可用缓存。';

  return new VideoServiceError(code, message, result);
};

export const getAllVideos = async (context?: VideoServiceContext): Promise<VideoItem[]> => {
  const now = Date.now();
  let currentCache = getCurrentCache();

  if (!context?.bypassCache && !currentCache) {
    const hydratedItems = await hydrateFromPersistedCache();

    if (hydratedItems && hydratedItems.length > 0) {
      currentCache = getCurrentCache();
    }
  }

  if (!context?.bypassCache && currentCache) {
    if (currentCache.expiresAt <= now) {
      revalidateInBackground();
    }

    return currentCache.items;
  }

  const result = await refreshVideos(context);
  const cacheAfterRefresh = getCurrentCache();

  if (result.source === 'backend' && result.status === 'empty' && cacheAfterRefresh) {
    return cacheAfterRefresh.items;
  }

  if (shouldThrowResult(result)) {
    if (cacheAfterRefresh) {
      return cacheAfterRefresh.items;
    }

    if (!context?.bypassCache) {
      return [];
    }

    throw toServiceError(result);
  }

  return result.items;
};

const normalizePageNumber = (value: number) =>
  Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;

const normalizePageSize = (value?: number) =>
  Math.min(
    Number.isFinite(value) && Number(value) > 0
      ? Math.floor(Number(value))
      : DEFAULT_BACKEND_PAGE_SIZE,
    DEFAULT_BACKEND_PAGE_SIZE,
  );

export const getVideoPage = async (context: VideoPageContext): Promise<VideoPageResult> => {
  const page = normalizePageNumber(context.page);
  const pageSize = normalizePageSize(context.pageSize);
  const commitToCache = context.commitToCache !== false;
  const result = await fetchBackendVideoPage({
    category: context.category,
    cursor: context.cursor,
    page,
    pageSize,
    signal: context.signal,
  });
  const cache = getCurrentCache();
  const previousItems = commitToCache ? (cache?.items ?? []) : [];

  if (
    result.items.length === 0 &&
    (result.status === 'crawl_failed' || result.status === 'parse_failed')
  ) {
    if (previousItems.length > 0 && page === 1) {
      return {
        hasMore: false,
        items: [],
        mergedItems: previousItems,
        page,
        pageSize,
        source: result.source ?? cache?.source,
      };
    }

    throw toServiceError(result);
  }

  const mergedItems = dedupeVideos([...previousItems, ...result.items]);
  const errors = [...(cache?.errors ?? []), ...result.errors];
  const hasNewItems = mergedItems.length > previousItems.length;
  const shouldCommit = hasNewItems || (result.items.length > 0 && previousItems.length === 0);

  if (commitToCache && shouldCommit) {
    setCachedResult(
      {
        errors,
        items: mergedItems,
        source: result.source ?? cache?.source,
        stats: buildStats(
          mergedItems,
          result.stats.durationMs,
          Math.max(cache?.stats.rawTotal ?? 0, mergedItems.length),
          errors,
        ),
        status: errors.length > 0 ? 'partial' : 'ok',
      },
      { preserveEpisodeProgress: false },
    );
  }

  return {
    hasMore: result.hasMore ?? result.stats.rawTotal >= pageSize,
    items: result.items,
    mergedItems: shouldCommit ? mergedItems : previousItems,
    ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}),
    page,
    pageSize,
    source: result.source ?? cache?.source,
  };
};

export const getVideoById = async (
  id: string,
  context?: VideoServiceContext,
): Promise<VideoItem | undefined> => {
  const cachedItem = getCachedItems().find((video) => video.id === id);

  if (cachedItem && !context?.bypassCache) {
    return cachedItem;
  }

  const providerItem = await fetchVideoDetail(id, context);

  if (providerItem) {
    const cache = getCurrentCache();

    if (cache) {
      const hasItem = cache.items.some((video) => video.id === providerItem.id);
      const nextItems = hasItem
        ? cache.items.map((video) => (video.id === providerItem.id ? providerItem : video))
        : [providerItem, ...cache.items];
      const sortedItems = sortDefaultVideos(dedupeVideos(nextItems));

      setCachedResult(
        {
          errors: cache.errors,
          items: sortedItems,
          source: cache.source,
          stats: buildStats(
            sortedItems,
            cache.stats.durationMs,
            cache.stats.rawTotal,
            cache.errors,
          ),
          status: cache.status,
        },
        { preserveEpisodeProgress: false },
      );
    }

    return providerItem;
  }

  if (cachedItem) {
    return cachedItem;
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

  if (appCategory === '推荐') {
    return getRecommendedVideos(context);
  }

  return sortDefaultVideos(videos.filter((video) => video.category === appCategory));
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

const createEmptyPreference = (): RecommendationPreference => ({
  categories: new Map<string, number>(),
  favoriteIds: new Set<string>(),
  historyIds: new Map<string, number>(),
  latestHistoryAt: 0,
});

const getHistoryPreference = (videos: VideoItem[]) => {
  try {
    return usePlayHistoryStore.getState().history.reduce((preference, item, index) => {
      const video = videos.find((candidate) => candidate.id === item.videoId);
      const recencyWeight = Math.max(1, 12 - index);

      preference.historyIds.set(item.videoId, recencyWeight);
      preference.latestHistoryAt = Math.max(
        preference.latestHistoryAt,
        toTimestamp(item.updatedAt),
      );
      addCategoryPreference(preference.categories, String(video?.category ?? ''), recencyWeight);

      return preference;
    }, createEmptyPreference());
  } catch {
    return createEmptyPreference();
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
  const playableBoost = isPlayableOrResolvable(video) ? 320 : 0;
  const recentScore = getRecencyScore(video.createdAt);
  const engagementScore = Math.min(getEngagementScore(video) / 1_000, 90);
  const latestSettingBoost = preference.categories.has('__latest__') ? recentScore * 0.7 : 0;
  const mostPlayedSettingBoost = preference.categories.has('__mostPlayed__')
    ? engagementScore * 0.7
    : 0;

  return (
    playableBoost +
    favoriteBoost +
    historyBoost * 9 +
    categoryWeight * 12 +
    recentScore +
    engagementScore +
    latestSettingBoost +
    mostPlayedSettingBoost
  );
};

export const searchVideos = async (
  keyword: string,
  context?: VideoServiceContext,
): Promise<VideoItem[]> => {
  const normalizedKeyword = keyword.trim().toLowerCase();

  if (!normalizedKeyword) {
    return [];
  }

  const cachedSearchResult = searchResultCache.get(normalizedKeyword);

  if (!context?.bypassCache && cachedSearchResult && cachedSearchResult.expiresAt > Date.now()) {
    return cachedSearchResult.items;
  }

  const providerResults = await searchProviderVideos(keyword, context);

  if (providerResults) {
    searchResultCache.set(normalizedKeyword, {
      expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
      items: providerResults,
    });

    if (searchResultCache.size > MAX_SEARCH_CACHE_ENTRIES) {
      const oldestKey = searchResultCache.keys().next().value;

      if (oldestKey) {
        searchResultCache.delete(oldestKey);
      }
    }

    return providerResults;
  }

  const videos = getCachedItems();

  return sortSearchResults(
    videos
      .map((video) => ({
        score: getSearchRelevanceScore(video, normalizedKeyword),
        video,
      }))
      .filter((item) => item.score > 0)
      .map((item) => item.video),
    normalizedKeyword,
  );
};

export const getRecommendedVideos = async (context?: VideoServiceContext): Promise<VideoItem[]> => {
  const videos = await getAllVideos(context);
  const preference = getRecommendationPreference(videos, context);

  return rankRecommendedVideos(videos, (video) => getRecommendationScore(video, preference));
};

export const getPlayableVideos = async (context?: VideoServiceContext): Promise<VideoItem[]> => {
  const videos = await getAllVideos(context);

  return [...videos].filter(isPlayableOrResolvable).sort(comparePlayableVideos);
};

export const getUnsupportedVideos = async (context?: VideoServiceContext): Promise<VideoItem[]> => {
  const videos = await getAllVideos(context);

  return [...videos]
    .filter((video) => !isPlayableOrResolvable(video))
    .sort(compareUnsupportedVideos);
};

export const removeVideosByIds = (videoIds: string[]): number => {
  const cache = getCurrentCache();

  if (!cache || videoIds.length === 0) {
    return 0;
  }

  const removeSet = new Set(videoIds);
  const previousCount = cache.items.length;
  const remaining = cache.items.filter((video) => !removeSet.has(video.id));
  const removedCount = previousCount - remaining.length;

  if (removedCount === 0) {
    return 0;
  }

  setCachedResult(
    {
      errors: cache.errors,
      items: remaining,
      source: cache.source,
      stats: buildStats(remaining, cache.stats.durationMs, cache.stats.rawTotal, []),
      status: cache.status,
    },
    { preserveEpisodeProgress: false },
  );

  return removedCount;
};

export const clearVideoServiceCache = () => {
  abortBackgroundDeepCrawl();
  resetRefreshCoordinator();
  clearVideoCache();
  clearVideoRepositoryCaches();
  searchResultCache.clear();
  void clearLocalCrawlerProviderState();
};
